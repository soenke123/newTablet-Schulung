-- ══════════════════════════════════════════════════════════════
-- Migration 0063 — Zukunftsboard: Themen-Tags + Zustimmung
-- ══════════════════════════════════════════════════════════════
-- Zwei Ergänzungen zum Board aus 0062:
--
--   1) THEMEN. Eine Karte kann auf KI, Social Media und Gaming
--      zeigen — mehrere gleichzeitig oder gar keins. Deshalb ein
--      text[] und keine zweite Enum-Spalte: „mehrere oder keins"
--      ist genau das, was ein Array abbildet, und die Kategorie
--      bleibt die eine Pflicht-Achse.
--
--   2) ZUSTIMMUNG. Wer eine Aussage teilt, kann ihr zustimmen.
--      Das gibt der Besprechung in Phase 3 eine Reihenfolge:
--      man sieht, welche Punkte im Kurs Gewicht haben.
--
-- Absichtliche Festlegungen (leicht zu ändern, wenn anders gewollt):
--   • Der eigenen Karte kann man nicht zustimmen. „Ich stimme mir
--     zu" trägt keine Information und bläht nur die Zahl auf.
--   • Zustimmen geht in JEDER Phase, auch in Phase 3. Das Einfrieren
--     dort gilt dem Inhalt; die Zustimmung ist der Kern des
--     Gesprächs und muss dann erst recht möglich sein.
--
-- ⚠️ board_upsert_note bekommt einen Parameter und wird deshalb
-- DROPPED und neu angelegt. `create or replace` mit anderer
-- Signatur würde eine zweite Funktion daneben legen, und PostgREST
-- könnte zwischen den beiden nicht mehr wählen. Der Drop trifft
-- gezielt die alte 9-Parameter-Signatur, geprüft über pg_proc —
-- Supabase wird ihn trotzdem als „destructive" markieren, das ist
-- hier unvermeidbar und in Ordnung: es geht um eine Funktion von
-- gestern, nicht um Daten.
--
-- Sonst kein DROP — Idempotenz per DO-Block + pg_catalog-Check.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) board_notes.topics
-- ─────────────────────────────────────────────────────────────
alter table board_notes
  add column if not exists topics text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'board_notes_topics_valid'
       and conrelid = 'board_notes'::regclass
  ) then
    -- <@ = „ist enthalten in". Deckt leeres Array (immer erlaubt),
    -- Teilmengen und die Vollmenge ab; alles andere fliegt raus.
    alter table board_notes
      add constraint board_notes_topics_valid
      check (topics <@ array['ki','socialmedia','gaming']::text[]);
  end if;
end $$;

comment on column board_notes.topics is
  'Auf welche Technologien die Karte zeigt: ki / socialmedia / gaming. '
  'Mehrfach oder leer erlaubt — die Pflicht-Achse ist category.';


-- ─────────────────────────────────────────────────────────────
-- 2) board_likes
-- ─────────────────────────────────────────────────────────────
-- Ein User kann jeder Karte genau einmal zustimmen — der
-- Primärschlüssel erledigt das, kein Zähler der doppelt laufen kann.
create table if not exists board_likes (
  note_id    uuid not null references board_notes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists board_likes_note_idx on board_likes(note_id);

alter table board_likes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'board_likes'
       and policyname = 'bl_select_cluster'
  ) then
    create policy bl_select_cluster on board_likes
      for select using (
        exists (
          select 1 from board_notes n
           where n.id = board_likes.note_id
             and n.cluster_id = (select cluster_id from profiles where id = auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'board_likes'
       and policyname = 'bl_select_admin'
  ) then
    create policy bl_select_admin on board_likes
      for select using (
        is_any_admin() and exists (
          select 1 from board_notes n join clusters c on c.id = n.cluster_id
           where n.id = board_likes.note_id
             and (is_superadmin() or c.school_id = my_school_id())
        )
      );
  end if;
end $$;

grant select on board_likes to authenticated;
grant select, insert, update, delete on board_likes to service_role;

comment on table board_likes is
  'Zustimmung zu einer Board-Karte. PK (note_id, user_id) = genau eine '
  'Stimme pro Person und Karte.';


-- ─────────────────────────────────────────────────────────────
-- 3) board_get — jetzt mit topics, likes und liked_by_me
-- ─────────────────────────────────────────────────────────────
-- Signatur unverändert, deshalb reicht create or replace.
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

  -- Fehlende Zeile = Phase 1.
  select phase into v_phase from board_state where cluster_id = v_cluster;
  v_phase := coalesce(v_phase, 1);

  select coalesce(jsonb_agg(t.x order by t.created_at), '[]'::jsonb)
    into v_notes
    from (
      select n.created_at, jsonb_build_object(
               'id',            n.id,
               'kind',          n.kind,
               'category',      n.category,
               'stance',        n.stance,
               'topics',        to_jsonb(n.topics),
               'text',          n.body,
               'author',        pr.display_name,
               'user_id',       n.user_id,
               'is_mine',       (n.user_id = v_user),
               'likes',         (select count(*) from board_likes bl where bl.note_id = n.id),
               'liked_by_me',   exists (select 1 from board_likes bl
                                         where bl.note_id = n.id and bl.user_id = v_user),
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
-- 4) board_toggle_like(p_note_id) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Ein Aufruf schaltet um: noch keine Stimme → setzen, sonst
-- zurückziehen. Antwort { ok, liked, likes } — der Client muss
-- nicht wissen, was vorher war.
create or replace function board_toggle_like(p_note_id uuid)
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

  select id, user_id, cluster_id into v_note from board_notes where id = p_note_id;
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
    select 1 from board_likes where note_id = p_note_id and user_id = v_user
  ) into v_had;

  if v_had then
    delete from board_likes where note_id = p_note_id and user_id = v_user;
  else
    -- on conflict: zwei schnelle Klicks oder zwei Tabs derselben
    -- Person dürfen nicht in einen Fehler laufen.
    insert into board_likes (note_id, user_id)
    values (p_note_id, v_user)
    on conflict (note_id, user_id) do nothing;
  end if;

  select count(*) into v_count from board_likes where note_id = p_note_id;

  return jsonb_build_object('ok', true, 'liked', not v_had, 'likes', v_count);
end;
$$;

revoke all on function board_toggle_like(uuid) from public;
grant execute on function board_toggle_like(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) board_upsert_note — neu mit p_topics
-- ─────────────────────────────────────────────────────────────
-- Erst die alte Signatur gezielt entfernen (siehe Kopf), dann neu.
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'board_upsert_note'
       and pg_get_function_identity_arguments(p.oid)
           = 'uuid, text, text, text, text, text, text, date, uuid'
  ) then
    execute 'drop function public.board_upsert_note(uuid, text, text, text, text, text, text, date, uuid)';
  end if;
end $$;

create or replace function board_upsert_note(
  p_id            uuid,
  p_kind          text,
  p_category      text,
  p_stance        text,
  p_text          text,
  p_source_url    text   default null,
  p_source_author text   default null,
  p_source_date   date   default null,
  p_cluster_id    uuid   default null,
  p_topics        text[] default '{}'
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
  v_topics   text[] := coalesce(p_topics, '{}');
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

  -- Die NULL-Prüfungen stehen vor den not-in-Listen: `NULL not in (…)`
  -- ergibt NULL, nicht true, und liefe sonst an der Wache vorbei.
  if p_kind is null or p_category is null or p_stance is null
     or p_kind not in ('idee','fakt')
     or p_category not in ('persoenlich','gesellschaftlich','politisch',
                           'bildung','wirtschaftlich','umwelt')
     or p_stance not in ('chance','risiko','vermutung')
     or v_text is null or char_length(v_text) < 3 or char_length(v_text) > 200
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Themen sind freiwillig (leer erlaubt), aber nicht frei erfindbar.
  if not (v_topics <@ array['ki','socialmedia','gaming']::text[]) then
    return jsonb_build_object('ok', false, 'error', 'invalid_topics');
  end if;
  -- Auf kanonische Reihenfolge bringen und Doppelte entfernen: sonst
  -- hängt die Anzeige an der Klick-Reihenfolge im Formular.
  v_topics := array(
    select t from unnest(array['ki','socialmedia','gaming']) t where t = any(v_topics)
  );

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
    -- Art bleibt, was sie ist — sonst würde ein Post-It in Phase 2 zum
    -- Fakt umgewidmet und das Kontingent umgangen.
    if v_old.kind <> p_kind then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;

    update board_notes
       set category      = p_category,
           stance        = p_stance,
           topics        = v_topics,
           body          = v_text,
           source_url    = v_url,
           source_author = v_author,
           source_date   = case when p_kind = 'fakt' then p_source_date else null end,
           updated_at    = now()
     where id = p_id;

    return jsonb_build_object('ok', true, 'id', p_id, 'updated', true);
  end if;

  -- ── Insert ────────────────────────────────────────────────
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

  insert into board_notes (cluster_id, user_id, kind, category, stance, topics, body,
                           source_url, source_author, source_date)
  values (v_cluster, v_user, p_kind, p_category, p_stance, v_topics, v_text,
          v_url, v_author,
          case when p_kind = 'fakt' then p_source_date else null end)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'updated', false);
end;
$$;

revoke all on function board_upsert_note(uuid, text, text, text, text, text, text, date, uuid, text[]) from public;
grant execute on function board_upsert_note(uuid, text, text, text, text, text, text, date, uuid, text[]) to authenticated;
