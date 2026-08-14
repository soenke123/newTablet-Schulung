-- ══════════════════════════════════════════════════════════════
-- Migration 0062 — Zukunftsboard (game19)
-- ══════════════════════════════════════════════════════════════
-- Erstes kollaboratives Werkzeug der Lernwelt: ein vom Admin
-- moderiertes Board, auf dem ein ganzer Kurs Chancen und Risiken
-- von KI, Social Media und Handy-Games sammelt, belegt und
-- bespricht. Bisher war jede Kachel Einzelleistung — hier sehen
-- sich die Schüler:innen gegenseitig.
--
-- Drei Phasen, vom Admin geschaltet:
--   1 Sammeln    — bis zu 8 Postis je User (Chance/Risiko/Vermutung)
--   2 Belegen    — 1 Pflicht-Fakt, 2 möglich, mit vollständiger Quelle
--   3 Besprechen — alles eingefroren
--
-- Abgrenzung zu den bestehenden Persistenz-Wegen: das hier ist
-- KEIN Spielstand. Die Daten gehören dem Kurs, nicht dem User —
-- deshalb eine eigene, cluster-skalierte Tabelle statt game_state,
-- shop_state oder user_game_saves.
--
-- ⚠️ Ein Board ist ein gemeinsamer Raum: jeder Text landet bei
-- allen anderen im Kurs auf dem Bildschirm. Deshalb sitzen die
-- Regeln (Phase, Eigentum, Kontingent, Quellen-Vollständigkeit,
-- URL-Schema) serverseitig und NICHT im Formular. Das Frontend
-- prüft dieselben Dinge nochmal, aber nur als Komfort.
--
-- Das Monster für game19 ist bewusst NICHT Teil dieser Migration.
-- Der games-Eintrag existiert, damit game_state später ohne Umbau
-- andocken kann; Wachstums- und Coin-Regel sind noch offen.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) board_state — eine Zeile pro Kurs
-- ─────────────────────────────────────────────────────────────
-- Eigene Tabelle statt einer Spalte auf clusters: das Board ist
-- ein Feature, kein Kursattribut, und ein Reset soll clusters
-- nicht anfassen. Fehlende Zeile = Phase 1 (lazy angelegt).
create table if not exists board_state (
  cluster_id  uuid primary key references clusters(id) on delete cascade,
  phase       int  not null default 1 check (phase between 1 and 3),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

comment on table board_state is
  'Aktuelle Phase des Zukunftsboards je Kurs. Fehlende Zeile = Phase 1.';


-- ─────────────────────────────────────────────────────────────
-- 2) board_notes — Postis (Phase 1) und Fakten (Phase 2)
-- ─────────────────────────────────────────────────────────────
-- Eine Tabelle für beides: ein Fakt ist inhaltlich auch eine
-- Chance oder ein Risiko und trägt dieselbe Kategorie. Getrennte
-- Tabellen würden jede Abfrage und jede Ansicht verdoppeln.
--
-- Spaltenname `body` statt `text` — `text` ist ein Typname und
-- macht Ausdrücke wie char_length(btrim(text)) mehrdeutig lesbar.
-- Nach außen (RPC-JSON) heißt das Feld trotzdem `text`.
create table if not exists board_notes (
  id            uuid primary key default gen_random_uuid(),
  cluster_id    uuid not null references clusters(id)   on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('idee','fakt')),
  category      text not null check (category in
                  ('persoenlich','gesellschaftlich','politisch',
                   'bildung','wirtschaftlich','umwelt')),
  stance        text not null check (stance in ('chance','risiko','vermutung')),
  body          text not null check (char_length(btrim(body)) between 3 and 200),
  source_url    text,
  source_author text,
  source_date   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Vollständigkeit der Quelle als Tabellen-Constraint, damit sie
  -- nicht nur im Formular hängt. Die URL-Prüfung ist zugleich der
  -- Riegel gegen javascript:-Links, die sonst als klickbare
  -- „Quelle" bei allen anderen im Kurs landen würden.
  --
  -- „Datum nicht in der Zukunft" steht bewusst NICHT hier: current_date
  -- ist stable, nicht immutable, und Postgres lehnt es in einem CHECK
  -- ab. Diese Prüfung macht board_upsert_note.
  constraint board_notes_fact_source_complete check (
    kind <> 'fakt' or (
      source_url ~* '^https?://[^[:space:]]+\.[^[:space:]]+'    and
      char_length(btrim(source_author)) between 2 and 120        and
      source_date is not null
    )
  )
);

create index if not exists board_notes_cluster_idx
  on board_notes(cluster_id, kind, category);

-- Kontingent-Zählung je (User, Kurs, Art) — deckt die Quota-Prüfung
-- in board_upsert_note ab.
create index if not exists board_notes_quota_idx
  on board_notes(cluster_id, user_id, kind);

comment on table board_notes is
  'Postis und Fakten des Zukunftsboards. Cluster-skaliert: die Daten '
  'gehören dem Kurs, nicht dem einzelnen User.';
comment on column board_notes.source_date is
  'VERÖFFENTLICHUNGSdatum des Artikels — nicht das Abrufdatum. Steht '
  'so auch im Formular-Hilfetext.';


-- ─────────────────────────────────────────────────────────────
-- 3) RLS — nur SELECT, geschrieben wird ausschließlich per RPC
-- ─────────────────────────────────────────────────────────────
alter table board_state enable row level security;
alter table board_notes enable row level security;

do $$
begin
  -- Kursmitglieder: plain Vergleich, KEIN EXISTS-Selfjoin. Lehre aus
  -- Migration 0038 — Realtime kann Sub-Query-Policies bei Postgres-
  -- Changes nicht zuverlässig auswerten, und diese Policy soll auch
  -- dann noch taugen, wenn das Polling später durch Realtime ersetzt wird.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'board_notes'
       and policyname = 'bn_select_cluster'
  ) then
    create policy bn_select_cluster on board_notes
      for select using (
        cluster_id = (select cluster_id from profiles where id = auth.uid())
      );
  end if;

  -- Admins moderieren auch Kurse, in denen sie selbst nicht sind.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'board_notes'
       and policyname = 'bn_select_admin'
  ) then
    create policy bn_select_admin on board_notes
      for select using (
        is_any_admin() and (
          is_superadmin()
          or cluster_id in (select id from clusters where school_id = my_school_id())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'board_state'
       and policyname = 'bs_select_cluster'
  ) then
    create policy bs_select_cluster on board_state
      for select using (
        cluster_id = (select cluster_id from profiles where id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'board_state'
       and policyname = 'bs_select_admin'
  ) then
    create policy bs_select_admin on board_state
      for select using (
        is_any_admin() and (
          is_superadmin()
          or cluster_id in (select id from clusters where school_id = my_school_id())
        )
      );
  end if;
end $$;

-- Kein INSERT/UPDATE/DELETE für authenticated — nur via RPC.
grant select on board_notes to authenticated;
grant select on board_state to authenticated;
-- service_role explizit, sonst „permission denied" trotz service_role
-- (Regel: feedback_service_role_needs_explicit_grants).
grant select, insert, update, delete on board_notes to service_role;
grant select, insert, update, delete on board_state to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) board_target_cluster(p_cluster_id) → uuid
-- ─────────────────────────────────────────────────────────────
-- Auf welchem Kurs arbeitet der Aufrufer? Ein Schüler immer auf
-- seinem eigenen; ein Admin darf einen fremden angeben, solange er
-- zu seiner Schule gehört (Volladmin: jeden). Liefert NULL, wenn
-- nichts davon zutrifft — der Aufrufer erfährt so nicht einmal, ob
-- die geratene cluster_id überhaupt existiert.
create or replace function board_target_cluster(p_cluster_id uuid)
  returns uuid
  security definer
  stable
  set search_path = public
  language plpgsql
as $$
declare
  v_user       uuid := auth.uid();
  v_own        uuid;
  v_is_admin   boolean;
  v_is_super   boolean;
  v_school     uuid;
begin
  if v_user is null then
    return null;
  end if;

  select cluster_id, (is_admin or is_superadmin), is_superadmin, school_id
    into v_own, v_is_admin, v_is_super, v_school
    from profiles where id = v_user;

  if p_cluster_id is null then
    return v_own;
  end if;

  if p_cluster_id = v_own then
    return v_own;
  end if;

  if coalesce(v_is_admin, false) then
    if coalesce(v_is_super, false) then
      return (select id from clusters where id = p_cluster_id);
    end if;
    return (select id from clusters
             where id = p_cluster_id and school_id = v_school);
  end if;

  return null;
end;
$$;

revoke all on function board_target_cluster(uuid) from public;
grant execute on function board_target_cluster(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) board_get(p_cluster_id default null) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Ein Roundtrip für die ganze Seite: Phase, alle Karten inkl.
-- Anzeigename, und wie viel der Aufrufer selbst schon verbraucht
-- hat. Der Client pollt genau diese Funktion.
--
-- Namen sind bewusst für alle sichtbar (Design-Entscheidung): das
-- Board wird in Phase 3 gemeinsam besprochen, und dafür muss man
-- wissen, wen man ansprechen kann.
create or replace function board_get(p_cluster_id uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_phase   int;
  v_name    text;
  v_notes   jsonb;
  v_ideas   int;
  v_facts   int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  select name into v_name from clusters where id = v_cluster;

  -- Fehlende Zeile = Phase 1. into lässt v_phase bei „not found"
  -- unangetastet (null), coalesce fängt beides ab.
  select phase into v_phase from board_state where cluster_id = v_cluster;
  v_phase := coalesce(v_phase, 1);

  -- Sortierung über die echte Spalte, nicht über x->>'created_at':
  -- der JSON-Text wäre nur zufällig richtig sortiert.
  select coalesce(jsonb_agg(t.x order by t.created_at), '[]'::jsonb)
    into v_notes
    from (
      select n.created_at, jsonb_build_object(
               'id',            n.id,
               'kind',          n.kind,
               'category',      n.category,
               'stance',        n.stance,
               'text',          n.body,
               'author',        pr.display_name,
               'user_id',       n.user_id,
               'is_mine',       (n.user_id = v_user),
               'source_url',    n.source_url,
               'source_author', n.source_author,
               'source_date',   n.source_date,
               'created_at',    n.created_at,
               'updated_at',    n.updated_at
             ) as x
        from board_notes n
        left join profiles pr on pr.id = n.user_id
       where n.cluster_id = v_cluster
    ) t;

  select count(*) filter (where kind = 'idee'),
         count(*) filter (where kind = 'fakt')
    into v_ideas, v_facts
    from board_notes
   where cluster_id = v_cluster and user_id = v_user;

  return jsonb_build_object(
    'ok',           true,
    'cluster_id',   v_cluster,
    'cluster_name', v_name,
    'phase',        v_phase,
    'is_admin',     is_any_admin(),
    'notes',        v_notes,
    'me', jsonb_build_object(
            'user_id',     v_user,
            'ideas_used',  coalesce(v_ideas, 0),
            'ideas_max',   8,
            'facts_used',  coalesce(v_facts, 0),
            'facts_max',   2
          )
  );
end;
$$;

revoke all on function board_get(uuid) from public;
grant execute on function board_get(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) board_upsert_note(...) → jsonb
-- ─────────────────────────────────────────────────────────────
-- p_id null = neue Karte, sonst Update einer bestehenden.
--
-- Phasen-Regel (Admin ist von allem ausgenommen):
--   Phase 1 · Schüler → eigene 'idee' anlegen/ändern; 'fakt' verboten
--   Phase 2 · Schüler → eigene 'fakt' anlegen/ändern UND 'idee' noch
--                       korrigierbar (bewusst rückwärts erlaubt)
--   Phase 3 · Schüler → nichts mehr, alles eingefroren
create or replace function board_upsert_note(
  p_id            uuid,
  p_kind          text,
  p_category      text,
  p_stance        text,
  p_text          text,
  p_source_url    text default null,
  p_source_author text default null,
  p_source_date   date default null,
  p_cluster_id    uuid default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  IDEAS_MAX constant int := 8;
  FACTS_MAX constant int := 2;
  v_user     uuid := auth.uid();
  v_cluster  uuid;
  v_admin    boolean := is_any_admin();
  v_phase    int;
  v_session  record;
  v_game     record;
  v_old      record;
  v_text     text := btrim(p_text);
  v_url      text := nullif(btrim(coalesce(p_source_url, '')),    '');
  v_author   text := nullif(btrim(coalesce(p_source_author, '')), '');
  v_count    int;
  v_id       uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  -- Eingaben — dieselben Regeln wie im Formular, nur hier verbindlich.
  --
  -- Die NULL-Prüfungen stehen bewusst VOR den not-in-Listen: `NULL not in
  -- (…)` ergibt NULL, nicht true. Ohne sie liefe ein Aufruf mit fehlendem
  -- p_kind an dieser Wache vorbei und stürbe erst am NOT-NULL-Constraint —
  -- mit einem rohen 500er statt einer verständlichen Antwort.
  if p_kind is null or p_category is null or p_stance is null
     or p_kind not in ('idee','fakt')
     or p_category not in ('persoenlich','gesellschaftlich','politisch',
                           'bildung','wirtschaftlich','umwelt')
     or p_stance not in ('chance','risiko','vermutung')
     or v_text is null or char_length(v_text) < 3 or char_length(v_text) > 200
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Quelle: alle drei Felder oder gar keins. Ein Fakt ohne
  -- vollständige Quelle ist kein Fakt, sondern eine Behauptung.
  if p_kind = 'fakt' then
    if v_url is null or v_url !~* '^https?://[^[:space:]]+\.[^[:space:]]+' then
      return jsonb_build_object('ok', false, 'error', 'invalid_source_url');
    end if;
    if v_author is null or char_length(v_author) < 2 or char_length(v_author) > 120 then
      return jsonb_build_object('ok', false, 'error', 'invalid_source_author');
    end if;
    if p_source_date is null or p_source_date > current_date then
      return jsonb_build_object('ok', false, 'error', 'invalid_source_date');
    end if;
  else
    -- Postis tragen keine Quelle — falls der Client welche mitschickt,
    -- werden sie verworfen statt gespeichert.
    v_url    := null;
    v_author := null;
  end if;

  if not v_admin then
    select id, status, season into v_session from user_session where id = v_user;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'no_profile');
    end if;
    if v_session.status <> 'active' then
      return jsonb_build_object('ok', false, 'error', 'account_not_active');
    end if;

    select season, active into v_game from games where id = 'game19';
    if found and (not v_game.active or v_game.season > v_session.season) then
      return jsonb_build_object('ok', false, 'error', 'season_locked');
    end if;
  end if;

  select coalesce(phase, 1) into v_phase from board_state where cluster_id = v_cluster;
  v_phase := coalesce(v_phase, 1);

  if not v_admin then
    if v_phase >= 3 then
      return jsonb_build_object('ok', false, 'error', 'phase_locked');
    end if;
    if p_kind = 'fakt' and v_phase < 2 then
      return jsonb_build_object('ok', false, 'error', 'phase_locked');
    end if;
  end if;

  -- ── Update ────────────────────────────────────────────────
  if p_id is not null then
    select id, user_id, cluster_id, kind into v_old
      from board_notes where id = p_id;
    if not found or v_old.cluster_id <> v_cluster then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if not v_admin and v_old.user_id <> v_user then
      return jsonb_build_object('ok', false, 'error', 'not_owner');
    end if;
    -- Art einer bestehenden Karte bleibt, was sie ist. Sonst könnte
    -- ein Posti in Phase 2 zum Fakt umgewidmet werden und das
    -- Kontingent umgehen.
    if v_old.kind <> p_kind then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;

    update board_notes
       set category      = p_category,
           stance        = p_stance,
           body          = v_text,
           source_url    = v_url,
           source_author = v_author,
           source_date   = case when p_kind = 'fakt' then p_source_date else null end,
           updated_at    = now()
     where id = p_id;

    return jsonb_build_object('ok', true, 'id', p_id, 'updated', true);
  end if;

  -- ── Insert ────────────────────────────────────────────────
  -- Kontingent gilt pro (User, Kurs). Admins legen im Normalfall
  -- keine eigenen Karten an, sind aber auch nicht gedeckelt.
  if not v_admin then
    select count(*) into v_count
      from board_notes
     where cluster_id = v_cluster and user_id = v_user and kind = p_kind;

    if p_kind = 'idee' and v_count >= IDEAS_MAX then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded',
                                'used', v_count, 'max', IDEAS_MAX);
    end if;
    if p_kind = 'fakt' and v_count >= FACTS_MAX then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded',
                                'used', v_count, 'max', FACTS_MAX);
    end if;
  end if;

  insert into board_notes (cluster_id, user_id, kind, category, stance, body,
                           source_url, source_author, source_date)
  values (v_cluster, v_user, p_kind, p_category, p_stance, v_text,
          v_url, v_author,
          case when p_kind = 'fakt' then p_source_date else null end)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'updated', false);
end;
$$;

revoke all on function board_upsert_note(uuid, text, text, text, text, text, text, date, uuid) from public;
grant execute on function board_upsert_note(uuid, text, text, text, text, text, text, date, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) board_delete_note(p_id) → jsonb
-- ─────────────────────────────────────────────────────────────
create or replace function board_delete_note(p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_admin boolean := is_any_admin();
  v_old   record;
  v_phase int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, user_id, cluster_id, kind into v_old
    from board_notes where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Sichtbarkeit erst prüfen, dann Eigentum: ein fremder Kurs soll
  -- nicht einmal ein 'not_owner' zurückgeben.
  if board_target_cluster(v_old.cluster_id) is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not v_admin then
    if v_old.user_id <> v_user then
      return jsonb_build_object('ok', false, 'error', 'not_owner');
    end if;

    select coalesce(phase, 1) into v_phase from board_state where cluster_id = v_old.cluster_id;
    v_phase := coalesce(v_phase, 1);

    if v_phase >= 3 then
      return jsonb_build_object('ok', false, 'error', 'phase_locked');
    end if;
    if v_old.kind = 'fakt' and v_phase < 2 then
      return jsonb_build_object('ok', false, 'error', 'phase_locked');
    end if;
  end if;

  delete from board_notes where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function board_delete_note(uuid) from public;
grant execute on function board_delete_note(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) board_set_phase(p_cluster_id, p_phase) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Nur Admins. Vor- UND zurückschalten ist erlaubt: im Unterricht
-- passiert es, dass man nochmal eine Runde sammeln lässt.
create or replace function board_set_phase(p_cluster_id uuid, p_phase int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if p_phase is null or p_phase < 1 or p_phase > 3 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  insert into board_state (cluster_id, phase, updated_at, updated_by)
  values (v_cluster, p_phase, now(), v_user)
  on conflict (cluster_id) do update set
    phase      = excluded.phase,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'phase', p_phase);
end;
$$;

revoke all on function board_set_phase(uuid, int) from public;
grant execute on function board_set_phase(uuid, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 9) board_reset(p_cluster_id) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Räumt das Board leer und stellt auf Phase 1 zurück — für den
-- Fall, dass derselbe Kurs erneut geschult wird. Bewusst ohne
-- Archiv: ein zweiter Durchlauf soll nicht mit den Antworten des
-- ersten anfangen.
create or replace function board_reset(p_cluster_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_deleted int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  delete from board_notes where cluster_id = v_cluster;
  get diagnostics v_deleted = row_count;

  insert into board_state (cluster_id, phase, updated_at, updated_by)
  values (v_cluster, 1, now(), v_user)
  on conflict (cluster_id) do update set
    phase      = 1,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

revoke all on function board_reset(uuid) from public;
grant execute on function board_reset(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 10) games-Eintrag für game19
-- ─────────────────────────────────────────────────────────────
-- Ohne diese Zeile liefert unlock_game('game19', …) für einge-
-- loggte User 'game_not_found', was der Client als „falsches
-- Passwort" anzeigt (siehe Migration 0057). Der GAME_ACCESS-Hash
-- in GameHub/config.js gilt nur für Gäste.
--
-- requires_login = true ist hier eine Beschreibung, kein Riegel — die
-- Spalte wird bisher nirgends ausgewertet. Der echte Riegel ist, dass
-- board_get ohne auth.uid() 'not_authenticated' liefert und ein Gast
-- ohnehin keinen Kurs hat.
--
-- Passwort: "Zukunft2026"
-- SHA-256: efc15d7b5561ee4ca922a571af606d8eb67be3706ada4ff23eaf49395484848f
insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game19', 3, 'S3 Zukunftsboard', 'Zukunftsboard', '🧭',
   'efc15d7b5561ee4ca922a571af606d8eb67be3706ada4ff23eaf49395484848f',
   true, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;
