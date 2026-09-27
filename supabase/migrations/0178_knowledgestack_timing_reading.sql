-- ══════════════════════════════════════════════════════════════
-- 0178_knowledgestack_timing_reading.sql
-- ══════════════════════════════════════════════════════════════
-- 1. 5 Sekunden Vorlesezeit je Frage:
--    Beim Übergang in die Phase 'question' (ks_step) wird
--    phase_ends_at auf (time_limit_sec + 5) Sekunden gesetzt.
--    Dadurch haben Beamer und Schülergeräte 5 Sekunden Zeit,
--    in denen nur die Frage angezeigt wird und Antworten gesperrt sind.
--
-- 2. ks_answer:
--    Antworten während der ersten 5 Sekunden werden abgewiesen ('reading_phase').
--    Die Reaktionszeit und der Geschwindigkeitsbonus zählen erst ab
--    dem Erscheinen der Antworten (nach 5 Sekunden).
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) ks_step mit 5 Sekunden Vorlesezeit
-- ─────────────────────────────────────────────────────────────
create or replace function ks_step(p_code text, p_from text default null)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room     uuid := ks_owned_room(p_code);
  v_b        ks_boards;
  v_q        ks_questions;
  v_next_idx int;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  perform pg_advisory_xact_lock(hashtext(v_room::text));

  v_b := ks_ensure_board(v_room);

  if p_from is not null and p_from <> v_b.phase then
    return jsonb_build_object('ok', true, 'stale', true, 'phase', v_b.phase);
  end if;

  case
    when v_b.phase = 'lobby' then
      select * into v_q from ks_questions
       where catalog_id = v_b.catalog_id
       order by sort_order, id limit 1;

      if v_q.id is null then
        return jsonb_build_object('ok', false, 'error', 'no_questions');
      end if;

      update ks_players set score = 0, prev_score = 0, streak = 0,
                            last_emote = null, last_emote_at = null
       where room_id = v_room;
      delete from ks_answers where room_id = v_room;

      -- 5 Sekunden Vorlesezeit + time_limit_sec für Antworten
      update ks_boards
         set phase          = 'question',
             current_q_idx  = 0,
             phase_ends_at  = now() + ((coalesce(v_q.time_limit_sec, 20) + 5) * interval '1 second'),
             question_count = coalesce((select count(*) from ks_questions
                                         where catalog_id = v_b.catalog_id), 0),
             started_at     = now(),
             ended_at       = null
       where room_id = v_room;

    when v_b.phase = 'question' then
      update ks_boards
         set phase = 'reveal',
             phase_ends_at = null
       where room_id = v_room;

    when v_b.phase in ('reveal', 'podium') then
      update ks_players set prev_score = score where room_id = v_room;

      v_next_idx := v_b.current_q_idx + 1;

      if v_next_idx < v_b.question_count then
        select * into v_q from ks_questions
         where catalog_id = v_b.catalog_id
         order by sort_order, id offset v_next_idx limit 1;

        if v_q.id is null then
          update ks_boards
             set phase = 'ended', ended_at = now(), phase_ends_at = null
           where room_id = v_room;
        else
          -- 5 Sekunden Vorlesezeit + time_limit_sec für Antworten
          update ks_boards
             set phase         = 'question',
                 current_q_idx = v_next_idx,
                 phase_ends_at = now() + ((coalesce(v_q.time_limit_sec, 20) + 5) * interval '1 second')
           where room_id = v_room;
        end if;
      else
        update ks_boards
           set phase = 'ended', ended_at = now(), phase_ends_at = null
         where room_id = v_room;
      end if;

    when v_b.phase = 'ended' then
      update ks_boards
         set phase         = 'lobby',
             current_q_idx = 0,
             phase_ends_at = null,
             started_at    = null,
             ended_at      = null
       where room_id = v_room;

    else
      return jsonb_build_object('ok', false, 'error', 'phase_invalid');
  end case;

  select * into v_b from ks_boards where room_id = v_room;
  return jsonb_build_object('ok', true, 'phase', v_b.phase, 'idx', v_b.current_q_idx);
end;
$$;

revoke all on function ks_step(text, text) from public;
grant execute on function ks_step(text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) ks_answer — Vorlesezeit-Sperre & Zeitberechnung
-- ─────────────────────────────────────────────────────────────
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

  -- Vorlesezeit-Sperre: Wer drückt bevor die 5s Vorlesezeit um sind, wird abgewiesen
  if v_b.phase_ends_at is not null and now() < (v_b.phase_ends_at - (v_limit * interval '1 second')) then
    return jsonb_build_object('ok', false, 'error', 'reading_phase');
  end if;

  -- Reaktionszeit ab Ende der Vorlesezeit (Start der Antwortmöglichkeiten)
  v_ms := greatest(0, least(v_limit * 1000,
            (extract(epoch from (now() - (v_b.phase_ends_at - v_limit * interval '1 second')))
             * 1000)::int));

  -- correct_indices hat Vorrang vor correct_idx
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
