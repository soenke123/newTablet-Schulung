-- ══════════════════════════════════════════════════════════════
-- Migration 0078 — MPSkills-Tool-Registry (Stufe 2)
-- ══════════════════════════════════════════════════════════════
-- Zweite Migration des MPSkills-Bereichs (Konzept:
-- Konzept_MPSkills_v1.html, Abschnitt 07 + 10). Stufe 1 (0077)
-- brachte die Rolle, hier kommt die Liste dessen, was es gibt.
--
-- Noch keine Räume, keine Teilnehmer, keine Beiträge — die Kachel
-- kann in dieser Stufe angesehen, aber nicht geöffnet werden.
--
-- ── Warum eine eigene Tabelle und nicht `games` ────────────────
-- `games` trägt die Achsen der Schulung: season, folder unter
-- GameHub/, password_hash (historisch), requires_login,
-- cluster_managed, starter_pool. Ein MPSkills-Tool hat keine
-- Season, liegt in einem anderen Verzeichnis, kennt keine Kreatur
-- und wird nicht über cluster_unlocked_games freigeschaltet,
-- sondern über die Existenz eines Raums. Hinge es an `games`,
-- trüge jede Zeile Platzhalter für Werte, die nie etwas bedeuten
-- — dieselbe Überlegung, mit der 0075 die wc_*-Schicht neben
-- board_* gestellt hat, statt board_notes zu erweitern.
--
-- ── Die Registry IST die Erweiterbarkeit ──────────────────────
-- Der Sinn des ganzen Bereichs ist, dass ein neues Tool ein Ordner
-- und eine Zeile ist und keine Migration. Deshalb steht hier alles,
-- was das System über ein Tool wissen muss, in Spalten und in
-- `limits` — und nicht in einer if-Kette im Frontend.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) skill_tools
-- ─────────────────────────────────────────────────────────────
-- id ist ein sprechender Slug ('wordcloud'), keine laufende Nummer
-- wie bei games ('game20'). Die IDs der Schulung sind historisch
-- gewachsen und heute schwer zu lesen; hier gibt es keinen Grund,
-- denselben Weg zu gehen. Der Slug ist zugleich der Ordnername
-- unter MPSkills/tools/ — deshalb bleibt `folder` daneben trotzdem
-- als eigene Spalte: ein Tool soll umbenannt werden können, ohne
-- dass jeder bestehende Raum seine tool_id verliert.
create table if not exists skill_tools (
  id                text primary key,
  title             text not null,
  blurb             text,
  icon              text,
  folder            text not null,
  multi_room        boolean not null default true,
  max_participants  int  not null default 60 check (max_participants between 1 and 500),
  max_rooms         int  not null default 5  check (max_rooms between 1 and 50),
  limits            jsonb not null default '{}'::jsonb,
  active            boolean not null default true,
  sort_order        int  not null default 100,
  created_at        timestamptz not null default now()
);

comment on table skill_tools is
  'Registry der MPSkills-Werkzeuge. Ein neues Tool ist ein Ordner unter MPSkills/tools/ '
  'und eine Zeile hier — keine Migration.';
comment on column skill_tools.blurb is
  'Ein Satz für die Kachel. Was das Tool im Unterricht tut, nicht wie es funktioniert.';
comment on column skill_tools.multi_room is
  'Darf eine Lehrkraft mehrere Räume dieses Tools parallel haben? false = genau einer.';
comment on column skill_tools.max_participants is
  'Obergrenze Teilnehmer je Raum (Entscheidung 17.08.2026: 60). Jedes Gerät zählt einzeln.';
comment on column skill_tools.max_rooms is
  'Obergrenze LEBENDER Räume je (Lehrkraft, Tool) — Entscheidung 17.08.2026: 5. '
  'Abgelaufene und Testräume zählen nicht mit. Gelesen wird das ab Stufe 3 in skill_room_create.';
comment on column skill_tools.limits is
  'Tool-eigene Grenzen für die generische Inhaltsschicht (Stufe 4), z.B. '
  '{"max_entries":10,"min_len":3,"max_len":60}. Steht hier, damit ein neues Tool '
  'seine Regeln mitbringt, ohne dass eine RPC angefasst wird.';
comment on column skill_tools.active is
  'false = kein neuer Raum mehr. Bestehende Räume laufen bis zu ihrem Ablauf weiter '
  '(Entscheidung 17.08.2026) — ein Raum, in dem eine Klasse gerade arbeitet, darf nicht '
  'durch einen Schalter im Hintergrund verschwinden.';

create index if not exists skill_tools_active_idx
  on skill_tools(sort_order) where active = true;


-- ─────────────────────────────────────────────────────────────
-- 2) RLS
-- ─────────────────────────────────────────────────────────────
-- Lesen dürfen alle, auch ohne Login: die Landing zeigt Gästen,
-- was es hier gibt (Konzept Abschnitt 09). Es steht nichts
-- Schützenswertes drin — Titel, Icon, ein Satz Beschreibung.
--
-- Anders als bei `games` gibt es hier KEINEN zweiten View ohne
-- Geheimfeld: skill_tools hat kein password_hash, weil MPSkills
-- keine Passwörter kennt. Der Zugang ist der Raum-Code, und der
-- lebt ab Stufe 3 in skill_rooms — einer Tabelle, die anon
-- niemals direkt liest.
--
-- Schreiben nur Volladmin: Tools sind global, wie games seit 0053.
-- Eine Schule soll nicht die Werkzeugliste aller anderen ändern.
alter table skill_tools enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'skill_tools'
      and policyname = 'skill_tools_select_public'
  ) then
    execute 'alter policy skill_tools_select_public on skill_tools using (active = true or is_any_admin())';
  else
    execute 'create policy skill_tools_select_public on skill_tools for select using (active = true or is_any_admin())';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'skill_tools'
      and policyname = 'skill_tools_superadmin_write'
  ) then
    execute 'alter policy skill_tools_superadmin_write on skill_tools using (is_superadmin()) with check (is_superadmin())';
  else
    execute 'create policy skill_tools_superadmin_write on skill_tools for all using (is_superadmin()) with check (is_superadmin())';
  end if;
end $$;

grant select on skill_tools to anon, authenticated;
grant select, insert, update, delete on skill_tools to service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) Bestand
-- ─────────────────────────────────────────────────────────────
-- Geseedet in der Migration und nicht in seed.sql: seed.sql gehört
-- der Schulung und müsste sonst bei jeder Stufe erneut laufen.
-- Der Upsert ist idempotent, die Migration darf wiederholt werden.
--
-- Beide Tools sind hier ANGEKÜNDIGT, nicht fertig. Ob das Frontend
-- eines Tools schon ausgeliefert ist, weiß die Datenbank bewusst
-- nicht — das ist eine Eigenschaft des Deployments und steht als
-- `ready`-Flag in MPSkills/tools.js. Sonst müsste jede Auslieferung
-- eine Migration mitbringen.
insert into skill_tools (id, title, blurb, icon, folder, multi_room, limits, active, sort_order) values
  ('wordcloud', 'Wortwolke',
   'Eine Frage, viele kurze Antworten — was die Klasse am meisten trägt, steht am größten in der Mitte.',
   '☁️', 'wordcloud', true,
   '{"max_entries":10,"min_len":3,"max_len":60}'::jsonb, true, 10),
  ('poll', 'Abstimmung',
   'Eine Frage, feste Antwortmöglichkeiten, Balken in Echtzeit.',
   '📊', 'poll', true,
   '{"max_options":6,"max_len":60}'::jsonb, true, 20)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  sort_order = excluded.sort_order;
-- max_participants/max_rooms bewusst NICHT im do-update: wer sie für
-- ein Tool von Hand hochgesetzt hat, soll das durch ein erneutes
-- Ausführen dieser Migration nicht verlieren.
