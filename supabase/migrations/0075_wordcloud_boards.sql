-- ══════════════════════════════════════════════════════════════
-- Migration 0075 — Wortwolken (wc_*), erster Nutzer: game20
-- ══════════════════════════════════════════════════════════════
-- Season 1 braucht einen Gesprächseinstieg: EINE Frage — „Warum wollt
-- ihr ein Tablet in der Schule nutzen?" —, auf die der ganze Kurs
-- Begriffe wirft, die als Wolke dastehen und dann besprochen werden.
--
-- ── Warum eigene Tabellen und nicht board_* erweitern ─────────
-- Reality Check (0062–0074) kann das alles schon, aber es kann viel
-- mehr: sechs Bereiche, drei Haltungen, eine Themen-Achse, eine
-- Recherche-Phase mit Quellenzwang, eine zweiteilige Wachstumsformel.
-- Eine Wortwolke braucht davon nichts. Hätte man sie an board_notes
-- angehängt, müsste jede Karte Platzhalter für kind/category/stance
-- tragen — Werte, die nie etwas bedeuten und trotzdem in jedem CHECK,
-- jedem Index und jedem RPC mitlaufen. Und der Umbau der
-- Primärschlüssel von board_state/board_rewards liefe an einem Board,
-- das gerade in Kursen offen steht.
--
-- Deshalb: eine eigene, BEWUSST GENERISCHE Schicht. `board_key` sitzt
-- von Anfang an in jeder Tabelle, damit die zweite einfache Wortwolke
-- (ein anderer Einstieg, eine andere Season) nur einen neuen Schlüssel
-- braucht und keine Migration. Der Schlüssel IST die Spiel-ID und wird
-- gegen `games` geprüft — dadurch hängt auch das Season-Gate am
-- richtigen Spiel, ohne dass eine ID im Funktionsrumpf steht.
--
-- Wiederverwendet statt kopiert: board_target_cluster(uuid) aus 0062
-- löst „auf welchem Kurs arbeitet der Aufrufer" bereits vollständig
-- auf (Schüler → eigener Kurs, Admin → fremder Kurs seiner Schule,
-- Volladmin → jeder). Sein board_-Präfix ist historisch.
--
-- ── Was die Wolke vom Board unterscheidet ─────────────────────
--   • Zwei Phasen: 1 Sammeln · 2 Besprechen. Kein drittes Fach.
--   • Eine Kartenart, keine Kategorie, keine Haltung, keine Quelle.
--   • 10 Zettel je (User, Kurs, Board), Text 3–60 Zeichen.
--   • In Phase 2 ist der Inhalt eingefroren — auch Ändern und Löschen.
--     Anders als bei Reality Check gibt es keine zweite Arbeitsphase,
--     in der man nachbessern würde; Phase 2 ist reines Besprechen.
--   • Zustimmen geht in BEIDEN Phasen. Das Einfrieren gilt dem Inhalt,
--     nicht dem Gespräch (dieselbe Überlegung wie in 0063).
--   • Belohnung: Phase 1 zum ersten Mal beendet ⇒ das Ei schlüpft.
--     Jeder im Kurs bekommt eins, unabhängig davon, wie viel er
--     geschrieben hat — das hier ist die Einstiegskachel einer
--     Season-1-Schulung, keine Leistungsmessung. Kein Wachstum, keine
--     zweite Stufe, keine Bonbons (das Bonbon-System gehört der
--     Season 3, siehe 0071 — eine Season-1-Kachel macht dafür keine
--     neue Quelle auf).
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wc_state — eine Zeile je (Kurs, Board)
-- ─────────────────────────────────────────────────────────────
-- Fehlende Zeile = Phase 1 (lazy angelegt), wie board_state.
-- phase_max ist monoton und die Marke für „zum ersten Mal beendet":
-- die Lehrkraft darf zurückschalten (im Unterricht lässt man nochmal
-- sammeln), und ein Rückschritt darf die Belohnung weder wiederholen
-- noch zurücknehmen. Lehre aus 0067.
create table if not exists wc_state (
  cluster_id  uuid not null references clusters(id) on delete cascade,
  board_key   text not null,
  phase       int  not null default 1 check (phase     between 1 and 2),
  phase_max   int  not null default 1 check (phase_max between 1 and 2),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,
  primary key (cluster_id, board_key)
);

comment on table wc_state is
  'Phase einer Wortwolke je (Kurs, Board). Fehlende Zeile = Phase 1.';
comment on column wc_state.phase_max is
  'Höchste je erreichte Phase. Anders als phase monoton — die Lehrkraft '
  'darf zurückschalten, die Belohnung wird davon nicht berührt.';


-- ─────────────────────────────────────────────────────────────
-- 2) wc_notes — die Zettel
-- ─────────────────────────────────────────────────────────────
-- Spaltenname `body` statt `text` aus demselben Grund wie in 0062:
-- `text` ist ein Typname und macht char_length(btrim(text))
-- mehrdeutig lesbar. Nach außen (RPC-JSON) heißt das Feld `text`.
--
-- 60 Zeichen, nicht 200: gefragt sind Begriffe. In einer Wortwolke
-- soll die Größe einer Karte von der Zustimmung erzählen und nicht
-- davon, wie viel jemand geschrieben hat — ein langer Zettel belegt
-- mehr Fläche als ein kurzer mit mehr Stimmen und zieht damit mehr
-- Blick auf sich, als der Kurs ihm gibt.
create table if not exists wc_notes (
  id         uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references clusters(id)   on delete cascade,
  board_key  text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 3 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wc_notes_board_idx
  on wc_notes(cluster_id, board_key);

-- Deckt die Kontingent-Prüfung in wc_upsert_note ab.
create index if not exists wc_notes_quota_idx
  on wc_notes(cluster_id, board_key, user_id);

comment on table wc_notes is
  'Zettel einer Wortwolke. Cluster-skaliert: die Daten gehören dem Kurs, '
  'nicht dem einzelnen User.';


-- ─────────────────────────────────────────────────────────────
-- 3) wc_likes — Zustimmung
-- ─────────────────────────────────────────────────────────────
-- Der Primärschlüssel erledigt „genau eine Stimme pro Person und
-- Karte" — kein Zähler, der doppelt laufen kann.
create table if not exists wc_likes (
  note_id    uuid not null references wc_notes(id)    on delete cascade,
  user_id    uuid not null references auth.users(id)  on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists wc_likes_note_idx on wc_likes(note_id);

comment on table wc_likes is
  'Zustimmung zu einem Wolken-Zettel. PK (note_id, user_id) = genau eine '
  'Stimme pro Person und Karte.';


-- ─────────────────────────────────────────────────────────────
-- 4) wc_rewards — der Vergabe-Vermerk
-- ─────────────────────────────────────────────────────────────
-- Zugleich der Riegel gegen eine zweite Vergabe: der Poll ruft
-- wc_claim_reward alle paar Sekunden auf, und auf dem Zweitgerät läuft
-- derselbe Aufruf.
create table if not exists wc_rewards (
  cluster_id     uuid not null references clusters(id)   on delete cascade,
  board_key      text not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  creature       text,
  coins          int,
  terms_at_hatch int,
  hatched_at     timestamptz,
  primary key (cluster_id, board_key, user_id)
);

create index if not exists wc_rewards_user_idx on wc_rewards(user_id);

comment on table wc_rewards is
  'Belohnungs-Vergabe einer Wortwolke je (Kurs, Board, User). Existenz von '
  'hatched_at ist der Idempotenz-Riegel; wc_reset löscht die Zeile und gibt '
  'einen zweiten Durchlauf frei.';


-- ─────────────────────────────────────────────────────────────
-- 5) RLS — nur SELECT, geschrieben wird ausschließlich per RPC
-- ─────────────────────────────────────────────────────────────
alter table wc_state   enable row level security;
alter table wc_notes   enable row level security;
alter table wc_likes   enable row level security;
alter table wc_rewards enable row level security;

do $$
begin
  -- Kursmitglieder: plain Vergleich, KEIN EXISTS-Selfjoin. Lehre aus
  -- Migration 0038 — Realtime wertet Subquery-Policies bei
  -- Postgres-Changes nicht zuverlässig aus, und diese Policy soll auch
  -- dann noch taugen, wenn das Polling später durch Realtime ersetzt wird.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wc_notes'
       and policyname = 'wcn_select_cluster'
  ) then
    create policy wcn_select_cluster on wc_notes
      for select using (
        cluster_id = (select cluster_id from profiles where id = auth.uid())
      );
  end if;

  -- Admins moderieren auch Kurse, in denen sie selbst nicht sind.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wc_notes'
       and policyname = 'wcn_select_admin'
  ) then
    create policy wcn_select_admin on wc_notes
      for select using (
        is_any_admin() and (
          is_superadmin()
          or cluster_id in (select id from clusters where school_id = my_school_id())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wc_state'
       and policyname = 'wcs_select_cluster'
  ) then
    create policy wcs_select_cluster on wc_state
      for select using (
        cluster_id = (select cluster_id from profiles where id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wc_state'
       and policyname = 'wcs_select_admin'
  ) then
    create policy wcs_select_admin on wc_state
      for select using (
        is_any_admin() and (
          is_superadmin()
          or cluster_id in (select id from clusters where school_id = my_school_id())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wc_likes'
       and policyname = 'wcl_select_cluster'
  ) then
    create policy wcl_select_cluster on wc_likes
      for select using (
        exists (
          select 1 from wc_notes n
           where n.id = wc_likes.note_id
             and n.cluster_id = (select cluster_id from profiles where id = auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wc_likes'
       and policyname = 'wcl_select_admin'
  ) then
    create policy wcl_select_admin on wc_likes
      for select using (
        is_any_admin() and exists (
          select 1 from wc_notes n join clusters c on c.id = n.cluster_id
           where n.id = wc_likes.note_id
             and (is_superadmin() or c.school_id = my_school_id())
        )
      );
  end if;

  -- Die eigene Vergabe-Zeile.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wc_rewards'
       and policyname = 'wcr_select_own'
  ) then
    create policy wcr_select_own on wc_rewards
      for select using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wc_rewards'
       and policyname = 'wcr_select_admin'
  ) then
    create policy wcr_select_admin on wc_rewards
      for select using (
        is_any_admin() and (
          (select p.is_superadmin from profiles p where p.id = auth.uid())
          or cluster_id in (
            select c.id from clusters c where c.school_id = my_school_id()
          )
        )
      );
  end if;
end $$;

-- Kein INSERT/UPDATE/DELETE für authenticated — nur via RPC.
grant select on wc_state   to authenticated;
grant select on wc_notes   to authenticated;
grant select on wc_likes   to authenticated;
grant select on wc_rewards to authenticated;
-- service_role explizit, sonst „permission denied" trotz service_role
-- (Regel: feedback_service_role_needs_explicit_grants).
grant select, insert, update, delete on wc_state   to service_role;
grant select, insert, update, delete on wc_notes   to service_role;
grant select, insert, update, delete on wc_likes   to service_role;
grant select, insert, update, delete on wc_rewards to service_role;


-- ─────────────────────────────────────────────────────────────
-- 6) wc_valid_board(p_board) → boolean
-- ─────────────────────────────────────────────────────────────
-- Der Board-Schlüssel IST die Spiel-ID. Statt einer Liste im CHECK,
-- die bei jeder neuen Wolke eine Migration bräuchte, wird gegen
-- `games` geprüft — die Zeile muss ohnehin existieren, damit die
-- Kachel im Hub und in der Freischalt-Matrix auftaucht.
create or replace function wc_valid_board(p_board text)
  returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select p_board is not null
     and exists (select 1 from games g where g.id = p_board and g.active);
$$;

revoke all on function wc_valid_board(text) from public;
grant execute on function wc_valid_board(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) wc_get(p_cluster_id, p_board) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Ein Roundtrip für die ganze Seite: Phase, alle Zettel inkl.
-- Anzeigename und Zustimmungen, und wie viel der Aufrufer selbst schon
-- verbraucht hat. Der Client pollt genau diese Funktion.
--
-- Namen sind für alle sichtbar (Design-Entscheidung wie in 0062): die
-- Wolke wird in Phase 2 gemeinsam besprochen, und dafür muss man
-- wissen, wen man ansprechen kann.
create or replace function wc_get(
  p_cluster_id uuid default null,
  p_board      text default 'game20'
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  TERMS_MAX constant int := 10;
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_phase   int;
  v_name    text;
  v_notes   jsonb;
  v_used    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not wc_valid_board(p_board) then
    return jsonb_build_object('ok', false, 'error', 'invalid_board');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  select name into v_name from clusters where id = v_cluster;

  -- Fehlende Zeile = Phase 1. `into` lässt v_phase bei „not found"
  -- unangetastet (null), coalesce fängt beides ab.
  select phase into v_phase
    from wc_state where cluster_id = v_cluster and board_key = p_board;
  v_phase := coalesce(v_phase, 1);

  -- Sortierung über die echte Spalte, nicht über x->>'created_at':
  -- der JSON-Text wäre nur zufällig richtig sortiert.
  select coalesce(jsonb_agg(t.x order by t.created_at), '[]'::jsonb)
    into v_notes
    from (
      select n.created_at, jsonb_build_object(
               'id',          n.id,
               'text',        n.body,
               'author',      pr.display_name,
               'user_id',     n.user_id,
               'is_mine',     (n.user_id = v_user),
               -- Kommt der Zettel von der Lehrkraft? Der Client rahmt
               -- ihn damit ein. left join heißt: fehlt das Profil, ist
               -- die Antwort false.
               'by_admin',    (coalesce(pr.is_admin, false) or coalesce(pr.is_superadmin, false)),
               'likes',       (select count(*) from wc_likes wl where wl.note_id = n.id),
               'liked_by_me', exists (select 1 from wc_likes wl
                                       where wl.note_id = n.id and wl.user_id = v_user),
               'created_at',  n.created_at,
               'updated_at',  n.updated_at
             ) as x
        from wc_notes n
        left join profiles pr on pr.id = n.user_id
       where n.cluster_id = v_cluster and n.board_key = p_board
    ) t;

  select count(*) into v_used
    from wc_notes
   where cluster_id = v_cluster and board_key = p_board and user_id = v_user;

  return jsonb_build_object(
    'ok',           true,
    'cluster_id',   v_cluster,
    'cluster_name', v_name,
    'board_key',    p_board,
    'phase',        v_phase,
    'is_admin',     is_any_admin(),
    'notes',        v_notes,
    'me', jsonb_build_object(
            'user_id',    v_user,
            'terms_used', coalesce(v_used, 0),
            'terms_max',  TERMS_MAX
          )
  );
end;
$$;

revoke all on function wc_get(uuid, text) from public;
grant execute on function wc_get(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) wc_upsert_note(p_id, p_text, p_cluster_id, p_board) → jsonb
-- ─────────────────────────────────────────────────────────────
-- p_id null = neuer Zettel, sonst Änderung eines bestehenden.
--
-- Phasen-Regel (Admins sind von allem ausgenommen — sie moderieren und
-- werfen in der Besprechung auch mal selbst etwas dazu):
--   Phase 1 · Schüler → eigene Zettel anlegen, ändern, löschen
--   Phase 2 · Schüler → nichts mehr, der Inhalt ist eingefroren
create or replace function wc_upsert_note(
  p_id         uuid,
  p_text       text,
  p_cluster_id uuid default null,
  p_board      text default 'game20'
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  TERMS_MAX constant int := 10;
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_admin   boolean := is_any_admin();
  v_phase   int;
  v_session record;
  v_game    record;
  v_old     record;
  v_text    text := btrim(p_text);
  v_count   int;
  v_id      uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not wc_valid_board(p_board) then
    return jsonb_build_object('ok', false, 'error', 'invalid_board');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  -- Eingaben — dieselben Regeln wie im Formular, nur hier verbindlich.
  if v_text is null or char_length(v_text) < 3 or char_length(v_text) > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if not v_admin then
    select id, status, season into v_session from user_session where id = v_user;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'no_profile');
    end if;
    if v_session.status <> 'active' then
      return jsonb_build_object('ok', false, 'error', 'account_not_active');
    end if;

    -- Season-Gate am Board-Schlüssel, nicht an einer ID im Rumpf: der
    -- Schlüssel IST die Spiel-ID (siehe wc_valid_board).
    select season, active into v_game from games where id = p_board;
    if found and (not v_game.active or v_game.season > v_session.season) then
      return jsonb_build_object('ok', false, 'error', 'season_locked');
    end if;
  end if;

  select phase into v_phase
    from wc_state where cluster_id = v_cluster and board_key = p_board;
  v_phase := coalesce(v_phase, 1);

  -- In Phase 2 wird nur noch besprochen. Anders als beim Reality Check
  -- gibt es hier keine zweite Arbeitsphase, in der man nachbessern
  -- würde — also friert auch das Ändern mit ein.
  if not v_admin and v_phase >= 2 then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  -- ── Ändern ────────────────────────────────────────────────
  if p_id is not null then
    select id, user_id, cluster_id, board_key into v_old
      from wc_notes where id = p_id;
    if not found or v_old.cluster_id <> v_cluster or v_old.board_key <> p_board then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if not v_admin and v_old.user_id <> v_user then
      return jsonb_build_object('ok', false, 'error', 'not_owner');
    end if;

    update wc_notes
       set body       = v_text,
           updated_at = now()
     where id = p_id;

    return jsonb_build_object('ok', true, 'id', p_id, 'updated', true);
  end if;

  -- ── Anlegen ───────────────────────────────────────────────
  -- Kontingent gilt pro (User, Kurs, Board). Admins legen im Normalfall
  -- keine eigenen Zettel an, sind aber auch nicht gedeckelt.
  if not v_admin then
    select count(*) into v_count
      from wc_notes
     where cluster_id = v_cluster and board_key = p_board and user_id = v_user;

    if v_count >= TERMS_MAX then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded',
                                'used', v_count, 'max', TERMS_MAX);
    end if;
  end if;

  insert into wc_notes (cluster_id, board_key, user_id, body)
  values (v_cluster, p_board, v_user, v_text)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'updated', false);
end;
$$;

revoke all on function wc_upsert_note(uuid, text, uuid, text) from public;
grant execute on function wc_upsert_note(uuid, text, uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 9) wc_delete_note(p_id) → jsonb
-- ─────────────────────────────────────────────────────────────
create or replace function wc_delete_note(p_id uuid)
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

  select id, user_id, cluster_id, board_key into v_old
    from wc_notes where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Sichtbarkeit erst prüfen, dann Eigentum: ein fremder Kurs soll
  -- nicht einmal ein 'not_owner' zurückbekommen.
  if board_target_cluster(v_old.cluster_id) is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not v_admin then
    if v_old.user_id <> v_user then
      return jsonb_build_object('ok', false, 'error', 'not_owner');
    end if;

    select phase into v_phase
      from wc_state
     where cluster_id = v_old.cluster_id and board_key = v_old.board_key;
    v_phase := coalesce(v_phase, 1);

    if v_phase >= 2 then
      return jsonb_build_object('ok', false, 'error', 'phase_locked');
    end if;
  end if;

  delete from wc_notes where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function wc_delete_note(uuid) from public;
grant execute on function wc_delete_note(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 10) wc_toggle_like(p_note_id) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Ein Aufruf schaltet um: noch keine Stimme → setzen, sonst
-- zurückziehen. Antwort { ok, liked, likes } — der Client muss nicht
-- wissen, was vorher war.
--
-- Bewusst OHNE Phasen-Prüfung: zugestimmt werden darf auch in Phase 2.
-- Das Einfrieren dort gilt dem Inhalt; die Zustimmung ist der Kern des
-- Gesprächs und muss dann erst recht möglich sein.
create or replace function wc_toggle_like(p_note_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_note  record;
  v_had   boolean;
  v_count int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, user_id, cluster_id into v_note from wc_notes where id = p_note_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Sichtbarkeit vor allem anderen: aus einem fremden Kurs soll man
  -- nicht einmal erfahren, dass es die Karte gibt.
  if board_target_cluster(v_note.cluster_id) is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_note.user_id = v_user then
    return jsonb_build_object('ok', false, 'error', 'own_note');
  end if;

  select exists (
    select 1 from wc_likes where note_id = p_note_id and user_id = v_user
  ) into v_had;

  if v_had then
    delete from wc_likes where note_id = p_note_id and user_id = v_user;
  else
    -- on conflict: zwei schnelle Doppeltipps oder zwei Tabs derselben
    -- Person dürfen nicht in einen Fehler laufen.
    insert into wc_likes (note_id, user_id)
    values (p_note_id, v_user)
    on conflict (note_id, user_id) do nothing;
  end if;

  select count(*) into v_count from wc_likes where note_id = p_note_id;

  return jsonb_build_object('ok', true, 'liked', not v_had, 'likes', v_count);
end;
$$;

revoke all on function wc_toggle_like(uuid) from public;
grant execute on function wc_toggle_like(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 11) wc_set_phase(p_cluster_id, p_phase, p_board) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Nur Admins. Vor- UND zurückschalten ist erlaubt: im Unterricht
-- passiert es, dass man nochmal eine Runde sammeln lässt. phase_max
-- zieht dabei nur nach oben mit.
--
-- is_any_admin() steht ZUSÄTZLICH zur Kurs-Auflösung: board_target_cluster
-- allein liefert einem Schüler brav seinen eigenen Kurs (Lehre aus 0070).
create or replace function wc_set_phase(
  p_cluster_id uuid,
  p_phase      int,
  p_board      text default 'game20'
)
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
  if not wc_valid_board(p_board) then
    return jsonb_build_object('ok', false, 'error', 'invalid_board');
  end if;
  if p_phase is null or p_phase < 1 or p_phase > 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  insert into wc_state (cluster_id, board_key, phase, phase_max, updated_at, updated_by)
  values (v_cluster, p_board, p_phase, p_phase, now(), v_user)
  on conflict (cluster_id, board_key) do update set
    phase      = excluded.phase,
    phase_max  = greatest(wc_state.phase_max, excluded.phase),
    updated_at = now(),
    updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'phase', p_phase);
end;
$$;

revoke all on function wc_set_phase(uuid, int, text) from public;
grant execute on function wc_set_phase(uuid, int, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 12) wc_reset(p_cluster_id, p_board) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Räumt die Wolke leer, stellt auf Phase 1 zurück und gibt die
-- Belohnung wieder frei — für den Fall, dass derselbe Kurs erneut
-- geschult wird. Bewusst ohne Archiv: ein zweiter Durchlauf soll nicht
-- mit den Antworten des ersten anfangen.
--
-- Was NICHT passiert: game_state wird nicht angefasst. Das alte Monster
-- bleibt stehen und wird erst beim erneuten Schlüpfen ersetzt, die
-- verdienten Münzen bleiben.
create or replace function wc_reset(
  p_cluster_id uuid,
  p_board      text default 'game20'
)
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
  if not wc_valid_board(p_board) then
    return jsonb_build_object('ok', false, 'error', 'invalid_board');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  -- wc_likes hängt per on delete cascade an wc_notes.
  delete from wc_notes where cluster_id = v_cluster and board_key = p_board;
  get diagnostics v_deleted = row_count;

  delete from wc_rewards where cluster_id = v_cluster and board_key = p_board;

  insert into wc_state (cluster_id, board_key, phase, phase_max, updated_at, updated_by)
  values (v_cluster, p_board, 1, 1, now(), v_user)
  on conflict (cluster_id, board_key) do update set
    phase      = 1,
    phase_max  = 1,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

revoke all on function wc_reset(uuid, text) from public;
grant execute on function wc_reset(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 13) wc_creature() → text
-- ─────────────────────────────────────────────────────────────
-- Schnecke oder Fisch, 50/50. Bewusst KEIN Rarity-Roll wie in
-- board_creature(): das hier ist die erste Kachel einer Schulung und
-- der erste Moment, in dem ein Monster auftaucht — wenn beim Nachbarn
-- etwas Glitzerndes schlüpft und bei einem selbst nicht, ist der
-- gemeinsame Moment kaputt, bevor die Season angefangen hat.
create or replace function wc_creature()
  returns text
  security definer
  set search_path = public
  language sql
as $$
  select case when random() < 0.5 then 'snail' else 'fish' end;
$$;

revoke all on function wc_creature() from public;
grant execute on function wc_creature() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 14) wc_claim_reward(p_cluster_id, p_board) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Ein Moment, nicht zwei: Phase 1 zum ersten Mal beendet ⇒ das Ei
-- schlüpft. Kein Wachsen — die Wolke hat keine zweite Arbeitsphase, an
-- der sich Wachstum bemessen ließe.
--
-- Idempotent: der Poll ruft die Funktion alle paar Sekunden auf und auf
-- dem Zweitgerät läuft derselbe Aufruf. Wer zuerst kommt, sieht die
-- Sequenz; alle weiteren bekommen event = 'none'.
--
-- Antwort:
--   { ok, event: 'hatch' | 'none', creature, terms, coins_gained, phase }
create or replace function wc_claim_reward(
  p_cluster_id uuid default null,
  p_board      text default 'game20'
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  COINS      constant int := 10;
  v_user     uuid := auth.uid();
  v_cluster  uuid;
  v_pmax     int;
  v_rw       record;
  v_terms    int;
  v_creature text;
  v_sum      int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not wc_valid_board(p_board) then
    return jsonb_build_object('ok', false, 'error', 'invalid_board');
  end if;

  -- Admins moderieren die Wolke, sie sammeln nicht darauf. Sie hängen
  -- ohnehin in keinem Kurs, und über den Kurs-Wähler in der Oberfläche
  -- landen sie sonst reihum in fremden Kursen und würfelten dort
  -- Monster für sich selbst.
  if is_any_admin() then
    return jsonb_build_object('ok', true, 'event', 'none');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  select coalesce(phase_max, 1) into v_pmax
    from wc_state where cluster_id = v_cluster and board_key = p_board;
  v_pmax := coalesce(v_pmax, 1);

  select * into v_rw
    from wc_rewards
   where cluster_id = v_cluster and board_key = p_board and user_id = v_user;

  if v_pmax < 2 or (found and v_rw.hatched_at is not null) then
    return jsonb_build_object('ok', true, 'event', 'none');
  end if;

  -- Die Zahl der eigenen Zettel wird festgehalten, aber NICHT gerechnet:
  -- jeder im Kurs bekommt dasselbe. Sie steht hier, damit sich später
  -- beantworten lässt, wie viel jemand beigetragen hatte.
  select count(*) into v_terms
    from wc_notes
   where cluster_id = v_cluster and board_key = p_board and user_id = v_user;

  v_creature := wc_creature();

  insert into wc_rewards (cluster_id, board_key, user_id, creature, coins,
                          terms_at_hatch, hatched_at)
  values (v_cluster, p_board, v_user, v_creature, COINS, v_terms, now())
  on conflict (cluster_id, board_key, user_id) do update set
    creature       = excluded.creature,
    coins          = excluded.coins,
    terms_at_hatch = excluded.terms_at_hatch,
    hatched_at     = excluded.hatched_at;

  -- growth bleibt 0 — diese Kachel wächst nicht. coins steht bewusst
  -- NICHT im do-update-Zweig, sondern wird addiert: nach einem wc_reset
  -- ist das der zweite Durchlauf, und die Münzen des ersten sind
  -- verdient (dieselbe Überlegung wie in 0067).
  insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
  values (v_user, p_board, 0, 1, v_creature, 0, COINS, now())
  on conflict (user_id, game_id) do update set
    creature      = excluded.creature,
    growth        = 0,
    rounds_played = 1,
    coins         = game_state.coins + COINS,
    updated_at    = now();

  -- wallets.coins ist der redundante Gesamtstand und wird sonst nur in
  -- sync_game_state nachgezogen. Ohne diese Zeilen liefe die Rangliste
  -- auseinander, bis der User irgendein Spiel spielt.
  select coalesce(sum(coins), 0)::int into v_sum
    from game_state where user_id = v_user;
  insert into wallets (user_id, coins, updated_at)
  values (v_user, v_sum, now())
  on conflict (user_id) do update set
    coins      = v_sum,
    updated_at = now();

  -- Kein add_bonbons: das Bonbon-System gehört der Season 3 (0071).
  -- Eine Season-1-Kachel macht dafür keine neue Quelle auf.
  return jsonb_build_object(
    'ok', true, 'event', 'hatch',
    'creature',     v_creature,
    'terms',        coalesce(v_terms, 0),
    'coins_gained', COINS,
    'phase',        v_pmax
  );
end;
$$;

revoke all on function wc_claim_reward(uuid, text) from public;
grant execute on function wc_claim_reward(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 15) games-Eintrag für game20
-- ─────────────────────────────────────────────────────────────
-- Ohne diese Zeile lehnt wc_valid_board() jeden Aufruf ab (der
-- Board-Schlüssel wird gegen `games` geprüft), und die Kachel fehlte in
-- der Freischalt-Matrix.
--
-- password_hash ist null — Spiel-Passwörter sind seit 0070 ersatzlos
-- weg. cluster_managed bleibt beim Default true: die Lehrkraft schaltet
-- die Kachel pro Kurs auf, direkt im Hub oder im Admin-Panel.
-- Kein Backfill in cluster_unlocked_games: ein neues Spiel startet für
-- jeden Kurs zu.
--
-- requires_login = true ist eine Beschreibung, kein Riegel — die Spalte
-- wird nirgends ausgewertet. Der echte Riegel ist, dass wc_get ohne
-- auth.uid() 'not_authenticated' liefert und ein Gast keinen Kurs hat.
insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game20', 1, 'S1 wieso weshalb warum', 'Warum Tablets?', '💭', null, true, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;
