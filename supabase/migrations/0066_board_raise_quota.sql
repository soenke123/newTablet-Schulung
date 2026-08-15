-- ══════════════════════════════════════════════════════════════
-- Migration 0066 — Reality Check: größeres Kontingent
-- ══════════════════════════════════════════════════════════════
-- Aus 8 Post-Its werden 10, aus 2 Recherchen werden 5.
--
-- Grund: das alte Kontingent stammt aus der Zeit, als beide Fächer
-- in einer Ansicht lagen und die Sammelphase kurz war. Seit 0064
-- sind Phase 1 und Phase 2 getrennte Fächer mit eigener Zeit — und
-- zwei Recherchen sind zu wenig, um in Phase 3 wirklich etwas zu
-- vergleichen (eine Quelle allein ist noch kein Bild).
--
-- Die Zahl steht an zwei Stellen und muss an beiden gleich sein:
-- board_get meldet sie dem Client (Anzeige „x/10"), board_upsert_note
-- setzt sie durch. Deshalb werden hier beide Funktionen neu erklärt,
-- jeweils auf dem HÖCHSTEN bestehenden Stand:
--   • board_get           ← 0063 (topics, likes, liked_by_me)
--   • board_upsert_note   ← 0064 (neue Post-Its nur in Phase 1)
-- Geändert sind allein die Zahlen; alles andere ist unverändert
-- übernommen.
--
-- Kein DROP: beide Signaturen bleiben, wie sie sind — reines
-- create or replace.
--
-- Rückwärts unkritisch: das Kontingent wird nur beim Anlegen
-- geprüft. Wer nach einer späteren Senkung mehr Karten hätte, als
-- erlaubt sind, behält sie und kann bloß keine neuen mehr anlegen.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) board_get — meldet das neue Kontingent (10 / 5)
-- ─────────────────────────────────────────────────────────────
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
            'ideas_max',   10,
            'facts_used',  coalesce(v_facts, 0),
            'facts_max',   5
          )
  );
end;
$$;

revoke all on function board_get(uuid) from public;
grant execute on function board_get(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) board_upsert_note — setzt das neue Kontingent durch
-- ─────────────────────────────────────────────────────────────
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
  IDEAS_MAX constant int := 10;
  FACTS_MAX constant int := 5;
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

  -- Quelle: alle drei Felder oder gar keins. Eine Recherche ohne
  -- vollständige Quelle ist keine Recherche, sondern eine Behauptung.
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

  -- Phasen-Regel (Admin ist von allem ausgenommen):
  --   Phase 1 · anlegen und ändern von Post-Its; Recherchen gesperrt
  --   Phase 2 · anlegen und ändern von Recherchen; Post-Its nur noch ändern
  --   Phase 3 · nichts mehr
  if not v_admin then
    if v_phase >= 3 then
      return jsonb_build_object('ok', false, 'error', 'phase_locked');
    end if;
    if p_kind = 'fakt' and v_phase < 2 then
      return jsonb_build_object('ok', false, 'error', 'phase_locked');
    end if;
    if p_kind = 'idee' and v_phase >= 2 and p_id is null then
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
    -- Art bleibt, was sie ist — sonst würde ein Post-It in Phase 2 zur
    -- Recherche umgewidmet und das Kontingent umgangen.
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
