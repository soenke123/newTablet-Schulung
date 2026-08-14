-- ══════════════════════════════════════════════════════════════
-- Migration 0064 — Zukunftsboard: saubere Trennung der Phasen
-- ══════════════════════════════════════════════════════════════
-- Die Oberfläche zeigt ab jetzt immer genau EIN Fach: in Phase 1 die
-- Post-Its, ab Phase 2 die Fakten. Man kann zwischen beidem
-- umschalten, aber nur ansehend — geschrieben wird da, wo der Kurs
-- gerade steht. Zwei Regeln ziehen hier nach, damit das nicht bloß
-- eine Sache des Clients ist:
--
--   1) NEUE POST-ITS NUR IN PHASE 1. Bisher durfte man in Phase 2 noch
--      welche nachschieben. Das weicht die Trennung auf: wer in der
--      Belegen-Phase merkt, dass ihm noch eine Idee fehlt, schreibt sie
--      auf, statt zu belegen. Bestehende Post-Its bleiben in Phase 2
--      ausdrücklich ÄNDERBAR — einen Tippfehler nachbessern zu dürfen
--      ist etwas anderes, als nachträglich Neues nachzulegen (und die
--      Karten sind im Rückblick ja weiter sichtbar).
--
--   2) FAKTEN BEKOMMEN KEINE ZUSTIMMUNG. Ein Fakt steht oder fällt mit
--      seiner Quelle; ob er einem gefällt, ändert daran nichts. Die
--      Zustimmung gehört zu den Vermutungen und Einschätzungen der
--      Sammelphase — dort ordnet sie das Gespräch, hier würde sie es
--      verfälschen ("belegt" ist keine Mehrheitsfrage).
--
-- Alte Stimmen auf Fakten werden NICHT gelöscht: sie sind
-- Kursmaterial, kein Fehler, und die Oberfläche zeigt sie nirgends
-- mehr an. Wer wirklich aufräumen will, tut das per Hand.
--
-- Kein DROP: beide Signaturen bleiben, wie sie sind — reines
-- create or replace auf dem Stand von 0063.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) board_toggle_like — Fakten sind ausgenommen
-- ─────────────────────────────────────────────────────────────
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

  select id, user_id, cluster_id, kind into v_note from board_notes where id = p_note_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Sichtbarkeit vor allem anderen: aus einem fremden Kurs soll man
  -- nicht einmal erfahren, dass es die Karte gibt.
  if board_target_cluster(v_note.cluster_id) is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Zustimmung gibt es nur auf Post-Its (siehe Kopf).
  if v_note.kind = 'fakt' then
    return jsonb_build_object('ok', false, 'error', 'fact_not_likable');
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
-- 2) board_upsert_note — neue Post-Its nur in Phase 1
-- ─────────────────────────────────────────────────────────────
-- Basis ist der Stand aus 0063 (Themen); geändert ist allein der
-- Phasen-Block. Signatur unverändert, deshalb reicht replace.
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

  -- Phasen-Regel (Admin ist von allem ausgenommen):
  --   Phase 1 · anlegen und ändern von Post-Its; Fakten gesperrt
  --   Phase 2 · anlegen und ändern von Fakten; Post-Its nur noch ändern
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
