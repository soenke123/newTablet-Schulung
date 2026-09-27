-- ══════════════════════════════════════════════════════════════
-- Migration 0176 — Knowledge Stack: Katalog-Editor
-- ══════════════════════════════════════════════════════════════
-- Drei neue RPCs für den Editor und die Unterstützung für
-- mehrere richtige Antworten je Frage.
--
--  1) correct_indices smallint[] — optionales Array aller richtigen
--     Indizes. Wenn gesetzt, ersetzt es correct_idx bei der
--     Auswertung. Rückwärtskompatibel: bestehende Fragen ohne
--     correct_indices behalten correct_idx als Fallback.
--
--  2) ks_catalog_get(uuid) — einen Katalog mit allen Fragen laden.
--
--  3) ks_catalog_save(uuid, text, text, jsonb) — einen Katalog
--     anlegen oder aktualisieren. Atomares Ersetzen aller Fragen.
--
--  4) ks_catalog_delete(uuid) — einen EIGENEN Katalog löschen.
--
--  5) ks_answer — erweitert für correct_indices.
--
--  6) ks_room_get / ks_view — geben correct_indices in der
--     Auflösung mit heraus.
--
-- Kein DROP, kein ALTER an bestehenden NOT-NULL-Spalten.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalte correct_indices
-- ─────────────────────────────────────────────────────────────
-- Nullable: alte Fragen behalten correct_idx als Fallback.
-- Die CHECK-Bedingung stellt sicher, dass jeder Index zwischen
-- 0 und 3 liegt und mindestens ein Eintrag vorhanden ist.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'ks_questions' and column_name = 'correct_indices'
  ) then
    alter table ks_questions
      add column correct_indices smallint[] default null;
  end if;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2) ks_catalog_get — einen Katalog mit allen Fragen laden
-- ─────────────────────────────────────────────────────────────
-- Nur eigene oder Vorlagen-Kataloge. Gibt den Katalog mit
-- allen Fragen geordnet nach sort_order zurück.
create or replace function ks_catalog_get(p_catalog_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_cat  ks_catalogs;
  v_qs   jsonb;
begin
  select * into v_cat from ks_catalogs
   where id = p_catalog_id
     and (is_template or owner_id = v_user);

  if v_cat.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',              q.id,
    'question_text',   q.question_text,
    'options',         q.options,
    'correct_idx',     q.correct_idx,
    'correct_indices', q.correct_indices,
    'time_limit_sec',  q.time_limit_sec,
    'explanation',     q.explanation,
    'sort_order',      q.sort_order
  ) order by q.sort_order, q.id), '[]'::jsonb)
    into v_qs
    from ks_questions q
   where q.catalog_id = p_catalog_id;

  return jsonb_build_object(
    'ok',          true,
    'catalog_id',  v_cat.id,
    'title',       v_cat.title,
    'subject',     v_cat.subject,
    'is_template', v_cat.is_template,
    'mine',        (v_cat.owner_id = v_user),
    'questions',   v_qs
  );
end;
$$;

revoke all on function ks_catalog_get(uuid) from public;
grant execute on function ks_catalog_get(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) ks_catalog_save — Katalog + Fragen atomar speichern
-- ─────────────────────────────────────────────────────────────
-- p_catalog_id = NULL → neuer Katalog (owner_id = auth.uid()).
-- p_catalog_id = vorhandene UUID → Update (nur wenn eigener).
-- p_questions: JSON-Array mit Objekten:
--   { question_text, options, correct_idx, correct_indices,
--     time_limit_sec, explanation }
-- Reihenfolge im Array = sort_order.
create or replace function ks_catalog_save(
  p_catalog_id uuid,
  p_title      text,
  p_subject    text,
  p_questions  jsonb
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_cat  uuid;
  v_q    jsonb;
  v_i    int := 0;
  v_ci   smallint[];
  v_opts jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_title is null or trim(p_title) = '' then
    return jsonb_build_object('ok', false, 'error', 'title_required');
  end if;

  -- Neuer oder bestehender Katalog?
  if p_catalog_id is null then
    -- Neuen Katalog anlegen
    insert into ks_catalogs (owner_id, title, subject)
    values (v_user, trim(p_title), coalesce(nullif(trim(p_subject), ''), 'Alles Mögliche'))
    returning id into v_cat;
  else
    -- Bestehenden eigenen Katalog aktualisieren
    update ks_catalogs
       set title   = trim(p_title),
           subject = coalesce(nullif(trim(p_subject), ''), 'Alles Mögliche')
     where id = p_catalog_id
       and owner_id = v_user
       and is_template = false
    returning id into v_cat;

    if v_cat is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    -- Bestehende Fragen löschen (werden durch die neuen ersetzt)
    delete from ks_questions where catalog_id = v_cat;
  end if;

  -- Neue Fragen einfügen
  if p_questions is not null and jsonb_typeof(p_questions) = 'array' then
    for v_q in select * from jsonb_array_elements(p_questions) loop
      v_opts := v_q->'options';

      -- correct_indices aus dem JSON extrahieren (kann null sein)
      v_ci := null;
      if v_q ? 'correct_indices' and jsonb_typeof(v_q->'correct_indices') = 'array' then
        select array_agg(el::smallint)
          into v_ci
          from jsonb_array_elements_text(v_q->'correct_indices') el;
      end if;

      insert into ks_questions (
        catalog_id, question_text, options, correct_idx,
        correct_indices, time_limit_sec, explanation, sort_order
      ) values (
        v_cat,
        coalesce(v_q->>'question_text', ''),
        coalesce(v_opts, '["","","",""]'::jsonb),
        coalesce((v_q->>'correct_idx')::smallint, 0),
        v_ci,
        coalesce((v_q->>'time_limit_sec')::int, 20),
        v_q->>'explanation',
        v_i
      );

      v_i := v_i + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'ok',         true,
    'catalog_id', v_cat,
    'count',      v_i
  );
end;
$$;

revoke all on function ks_catalog_save(uuid, text, text, jsonb) from public;
grant execute on function ks_catalog_save(uuid, text, text, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) ks_catalog_delete — einen eigenen Katalog löschen
-- ─────────────────────────────────────────────────────────────
-- Nur eigene (nicht template). CASCADE löscht die Fragen mit.
create or replace function ks_catalog_delete(p_catalog_id uuid)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  delete from ks_catalogs
   where id = p_catalog_id
     and owner_id = v_user
     and is_template = false
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_catalog_delete(uuid) from public;
grant execute on function ks_catalog_delete(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) ks_answer — correct_indices-Unterstützung
-- ─────────────────────────────────────────────────────────────
-- Wenn correct_indices vorhanden ist, gilt eine Antwort als
-- richtig, wenn p_chosen in dem Array enthalten ist.
-- Sonst Fallback auf correct_idx.
create or replace function ks_answer(
  p_token        text,
  p_question_idx int,
  p_chosen       smallint,
  p_response_ms  int default 0
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p       skill_participants;
  v_b       ks_boards;
  v_pl      ks_players;
  v_q       ks_questions;
  v_correct boolean;
  v_limit   int;
  v_ms      int;
  v_base    int := 1000;
  v_bonus   int := 0;
  v_streak  int;
  v_mul     numeric := 1.0;
  v_points  int := 0;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;
  if v_p.blocked then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;

  perform pg_advisory_xact_lock(hashtext(v_p.room_id::text));

  v_b := ks_ensure_board(v_p.room_id);

  if v_b.phase <> 'question' or v_b.current_q_idx <> p_question_idx then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  if v_b.phase_ends_at is not null and now() > v_b.phase_ends_at + interval '1 second' then
    return jsonb_build_object('ok', false, 'error', 'time_up');
  end if;

  if exists (select 1 from ks_answers where room_id = v_p.room_id
               and question_idx = p_question_idx
               and participant_id = v_p.id) then
    return jsonb_build_object('ok', false, 'error', 'already_answered');
  end if;

  v_pl := ks_ensure_player(v_p.id, v_p.room_id);

  select * into v_q from ks_questions
   where catalog_id = v_b.catalog_id
   order by sort_order, id offset p_question_idx limit 1;

  if v_q.id is null then return jsonb_build_object('ok', false, 'error', 'question_not_found'); end if;

  if p_chosen < 0 or p_chosen >= jsonb_array_length(v_q.options) then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_limit := greatest(1, v_q.time_limit_sec);

  v_ms := greatest(0, least(v_limit * 1000,
            (extract(epoch from (now() - (v_b.phase_ends_at - v_limit * interval '1 second')))
             * 1000)::int));

  -- *** NEU: correct_indices hat Vorrang vor correct_idx ***
  if v_q.correct_indices is not null and array_length(v_q.correct_indices, 1) > 0 then
    v_correct := (p_chosen = any(v_q.correct_indices));
  else
    v_correct := (p_chosen = v_q.correct_idx);
  end if;

  if v_correct then
    v_streak := v_pl.streak + 1;
    v_bonus  := greatest(0, round(1000 * (1 - v_ms::numeric / (v_limit * 1000))));
    v_mul    := 1.0 + (least(v_streak, 5) * 0.1);
    v_points := round((v_base + v_bonus) * v_mul);
  else
    v_streak := 0;
    v_points := 0;
  end if;

  insert into ks_answers (room_id, question_idx, participant_id, chosen_idx,
                          is_correct, response_ms, points_awarded)
  values (v_p.room_id, p_question_idx, v_p.id, p_chosen,
          v_correct, v_ms, v_points);

  update ks_players
     set score  = score + v_points,
         streak = v_streak
   where participant_id = v_p.id;

  return jsonb_build_object(
    'ok',            true,
    'is_correct',    v_correct,
    'points_earned', v_points,
    'streak',        v_streak,
    'response_ms',   v_ms
  );
end;
$$;

revoke all on function ks_answer(text, int, smallint, int) from public;
grant execute on function ks_answer(text, int, smallint, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) ks_room_get — correct_indices in der Auflösung
-- ─────────────────────────────────────────────────────────────
create or replace function ks_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room    uuid := ks_owned_room(p_code);
  v_user    uuid := auth.uid();
  v_b       ks_boards;
  v_q       ks_questions;
  v_ans     jsonb;
  v_total   int;
  v_top     jsonb;
  v_players jsonb;
  v_cats    jsonb := null;
  v_ctitle  text;
  v_reveal  boolean;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_b := ks_ensure_board(v_room);
  v_reveal := v_b.phase in ('reveal', 'podium', 'ended');

  if v_b.phase <> 'lobby' then
    select * into v_q from ks_questions
     where catalog_id = v_b.catalog_id
     order by sort_order, id offset v_b.current_q_idx limit 1;
  end if;

  select title into v_ctitle from ks_catalogs where id = v_b.catalog_id;

  if v_b.phase = 'lobby' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id',    c.id,
             'title', c.title,
             'subject', c.subject,
             'mine',  (c.owner_id = v_user),
             'count', (select count(*) from ks_questions q where q.catalog_id = c.id)
           ) order by c.is_template desc, c.title asc), '[]'::jsonb)
      into v_cats
      from ks_catalogs c
     where c.is_template = true or (v_user is not null and c.owner_id = v_user);
  end if;

  select coalesce(jsonb_object_agg(chosen_idx, cnt), '{}'::jsonb),
         coalesce(sum(cnt), 0)
    into v_ans, v_total
    from (
      select chosen_idx, count(*)::int as cnt
        from ks_answers
       where room_id = v_room and question_idx = v_b.current_q_idx
       group by chosen_idx
    ) a;

  with ranked as (
    select p.participant_id, p.creature_id, p.skin_idx, p.score, p.prev_score,
           coalesce(nullif(p.nickname, ''), sp.name, 'Gast') as nickname,
           case when p.last_emote_at > now() - interval '3.5 seconds'
                then p.last_emote else null end as emote,
           (select a.is_correct from ks_answers a
             where a.room_id = v_room and a.question_idx = v_b.current_q_idx
               and a.participant_id = p.participant_id) as correct,
           exists(select 1 from ks_answers a
                   where a.room_id = v_room and a.question_idx = v_b.current_q_idx
                     and a.participant_id = p.participant_id) as answered,
           sp.seat,
           row_number() over (order by p.score desc, p.participant_id) as curr_rank,
           row_number() over (order by p.prev_score desc, p.participant_id) as old_rank
      from ks_players p
      join skill_participants sp on sp.id = p.participant_id
     where p.room_id = v_room
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'participant_id', participant_id,
               'creature_id',    creature_id,
               'skin_idx',       skin_idx,
               'nickname',       nickname,
               'score',          score,
               'rank',           curr_rank,
               'rank_change',    (old_rank - curr_rank),
               'delta',          (score - prev_score),
               'emote',          emote,
               'correct',        correct
             ) order by curr_rank asc)
        from ranked where curr_rank <= 5), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'participant_id', participant_id,
               'seat',           seat,
               'creature_id',    creature_id,
               'skin_idx',       skin_idx,
               'nickname',       nickname,
               'score',          score,
               'rank',           curr_rank,
               'emote',          emote,
               'correct',        correct,
               'answered',       answered
             ) order by seat)
        from ranked), '[]'::jsonb)
    into v_top, v_players;

  return jsonb_build_object(
    'ok',             true,
    'role',           'presenter',
    'phase',          case when v_b.phase = 'podium' then 'reveal' else v_b.phase end,
    'current_q_idx',  v_b.current_q_idx,
    'question_count', v_b.question_count,
    'phase_ends_at',  v_b.phase_ends_at,
    'server_now',     now(),
    'catalog_id',     v_b.catalog_id,
    'catalog_title',  v_ctitle,
    'catalogs',       v_cats,
    'question',       case when v_q.id is not null then jsonb_build_object(
                        'text',             v_q.question_text,
                        'options',          v_q.options,
                        'correct_idx',      case when v_reveal then v_q.correct_idx else null end,
                        'correct_indices',  case when v_reveal then
                                              to_jsonb(coalesce(v_q.correct_indices, array[v_q.correct_idx]))
                                            else null end,
                        'explanation',      case when v_reveal then v_q.explanation else null end,
                        'time_limit',       v_q.time_limit_sec
                      ) else null end,
    'answers_dist',   v_ans,
    'answers_total',  coalesce(v_total, 0),
    'leaderboard',    v_top,
    'players',        v_players
  );
end;
$$;

revoke all on function ks_room_get(text) from public;
grant execute on function ks_room_get(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) ks_view — correct_indices in der Auflösung
-- ─────────────────────────────────────────────────────────────
create or replace function ks_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p      skill_participants;
  v_b      ks_boards;
  v_pl     ks_players;
  v_q      ks_questions;
  v_my_ans ks_answers;
  v_rank   int;
  v_old    int;
  v_prev   jsonb;
  v_next   jsonb;
  v_reveal boolean;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;

  v_b  := ks_ensure_board(v_p.room_id);
  v_pl := ks_ensure_player(v_p.id, v_p.room_id);
  v_reveal := v_b.phase in ('reveal', 'podium', 'ended');

  select * into v_my_ans from ks_answers
   where room_id = v_p.room_id
     and question_idx = v_b.current_q_idx
     and participant_id = v_p.id;

  if v_b.phase <> 'lobby' then
    select * into v_q from ks_questions
     where catalog_id = v_b.catalog_id
     order by sort_order, id offset v_b.current_q_idx limit 1;
  end if;

  with ranked as (
    select p.participant_id, p.creature_id, p.skin_idx, p.score, p.prev_score,
           coalesce(nullif(p.nickname, ''), sp.name, 'Gast') as nickname,
           case when p.last_emote_at > now() - interval '3.5 seconds'
                then p.last_emote else null end as emote,
           row_number() over (order by p.score desc, p.participant_id) as curr_rank,
           row_number() over (order by p.prev_score desc, p.participant_id) as old_rank
      from ks_players p
      join skill_participants sp on sp.id = p.participant_id
     where p.room_id = v_p.room_id
  ),
  me as (select * from ranked where participant_id = v_p.id)
  select
    (select curr_rank from me),
    (select old_rank  from me),
    (select jsonb_build_object('creature_id', r.creature_id, 'skin_idx', r.skin_idx,
                               'nickname', r.nickname, 'score', r.score,
                               'rank', r.curr_rank, 'emote', r.emote)
       from ranked r
      where r.curr_rank = (select curr_rank from me) - 1),
    (select jsonb_build_object('creature_id', r.creature_id, 'skin_idx', r.skin_idx,
                               'nickname', r.nickname, 'score', r.score,
                               'rank', r.curr_rank, 'emote', r.emote)
       from ranked r
      where r.curr_rank = (select curr_rank from me) + 1)
    into v_rank, v_old, v_prev, v_next;

  return jsonb_build_object(
    'ok',             true,
    'role',           'participant',
    'phase',          case when v_b.phase = 'podium' then 'reveal' else v_b.phase end,
    'current_q_idx',  v_b.current_q_idx,
    'question_count', v_b.question_count,
    'phase_ends_at',  v_b.phase_ends_at,
    'server_now',     now(),
    'player_count',   (select count(*) from ks_players where room_id = v_p.room_id),
    'me', jsonb_build_object(
            'participant_id', v_p.id,
            'seat',           v_p.seat,
            'nickname',       coalesce(nullif(v_pl.nickname, ''), v_p.name, 'Gast'),
            'creature_id',    v_pl.creature_id,
            'skin_idx',       v_pl.skin_idx,
            'score',          v_pl.score,
            'streak',         v_pl.streak,
            'rank',           coalesce(v_rank, 1),
            'rank_change',    coalesce(v_old - v_rank, 0),
            'delta',          (v_pl.score - v_pl.prev_score),
            'emote',          case when v_pl.last_emote_at > now() - interval '3.5 seconds'
                                   then v_pl.last_emote else null end
          ),
    'my_answer', case when v_my_ans.id is not null then jsonb_build_object(
                   'chosen_idx',     v_my_ans.chosen_idx,
                   'is_correct',     v_my_ans.is_correct,
                   'points_awarded', v_my_ans.points_awarded
                 ) else null end,
    'question',  case when v_q.id is not null then jsonb_build_object(
                   'text',             case when v_reveal then v_q.question_text else null end,
                   'options',          v_q.options,
                   'time_limit',       v_q.time_limit_sec,
                   'correct_idx',      case when v_reveal then v_q.correct_idx else null end,
                   'correct_indices',  case when v_reveal then
                                         to_jsonb(coalesce(v_q.correct_indices, array[v_q.correct_idx]))
                                       else null end,
                   'explanation',      case when v_reveal then v_q.explanation else null end
                 ) else null end,
    'neighbor_before', v_prev,
    'neighbor_after',  v_next
  );
end;
$$;

revoke all on function ks_view(text) from public;
grant execute on function ks_view(text) to anon, authenticated;
