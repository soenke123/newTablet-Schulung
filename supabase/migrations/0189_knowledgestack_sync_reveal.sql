-- ═══════════════════════════════════════════════════════════════
-- 0189 — Knowledge Stack: Antworten überall im selben Augenblick
-- ═══════════════════════════════════════════════════════════════
-- Sönkes Beobachtung (04.10.2026): Beamer und Tablets decken die
-- Antworten nicht gleichzeitig auf — wer im vollen WLAN sitzt, sieht
-- sie später und tippt später. Unfair.
--
-- Die 5 Sekunden Vorlesezeit (0178) sind die richtige Idee: erst die
-- Frage, dann für alle zugleich die Antworten. Gleichzeitig wird es
-- aber nur, wenn jedes Gerät die Serveruhr genau kennt. Das erledigt
-- jetzt tool.js (Uhrabgleich wie bei NTP, siehe Kopf dort, Punkt 7).
-- Diese Migration liefert dafür zu, und sie hört auf, die Laufzeit
-- im Netz als Denkzeit zu zählen:
--
--   1. ks_room_sig / ks_sig geben 'server_now' mit. Die Signatur wird
--      bei jedem Takt geholt — so bekommt jedes Gerät laufend frische
--      Uhrproben, nicht nur eine je Frage. ('sig' selbst bleibt
--      unverändert.)
--
--   2. ks_answer:
--      a) Ein Tipp, der bis 1 s VOR dem Aufdecken ankommt, wird nicht
--         mehr abgewiesen, sondern zählt als „sofort" (0 ms). Ein
--         Gerät, dessen Uhrabgleich ein paar hundert ms daneben liegt,
--         bekommt sonst eine Fehlermeldung statt Punkte.
--      b) Die Zeit: bisher ab Aufdecken bis Ankunft am Server — darin
--         steckt der Weg durchs WLAN. Jetzt zählt die auf dem Gerät
--         gemessene Zeit (p_response_ms, ab dem eigenen Aufdecken),
--         aber nie mehr als die Serverzeit und höchstens 1,5 s
--         darunter. Mehr als 1,5 s lässt sich also nicht „schummeln",
--         und ein langsames WLAN kostet keine Punkte mehr.
--      c) time_limit_sec null → 20 (wie in ks_step), nicht 1.
--
-- Ohne diese Migration läuft tool.js weiter (server_now fehlt dann
-- nur in der Signatur, der Uhrabgleich nimmt die Ansicht).
--
-- Kein DROP, kein ALTER. Mehrfach ausführbar.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) ks_room_sig — wie 0188, plus server_now
-- ─────────────────────────────────────────────────────────────
create or replace function ks_room_sig(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := ks_owned_room(p_code);
  v_b    ks_boards;
  v_ans  int;
  v_n    int;
  v_sum  bigint;
  v_look bigint;
  v_emo  bigint;
  v_da   int;
  v_seat bigint;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_b := ks_ensure_board(v_room);

  select count(*) into v_ans from ks_answers
   where room_id = v_room and question_idx = v_b.current_q_idx
     and ks_present(participant_id);                        -- 0188

  select count(*),
         coalesce(sum(p.score), 0),
         coalesce(sum(p.creature_id * 7 + p.skin_idx * 3 + length(coalesce(p.nickname, ''))), 0),
         coalesce(max(extract(epoch from p.last_emote_at))::bigint, 0),
         count(*) filter (where ks_present(p.participant_id)),                         -- 0188
         coalesce(sum(sp.seat) filter (where ks_present(p.participant_id)), 0)         -- 0188
    into v_n, v_sum, v_look, v_emo, v_da, v_seat
    from ks_players p
    join skill_participants sp on sp.id = p.participant_id
   where p.room_id = v_room;

  return jsonb_build_object(
    'ok',  true,
    'sig', concat_ws(':',
             v_b.phase, v_b.current_q_idx, v_b.question_count,
             coalesce(v_b.catalog_id::text, '-'),
             v_ans, v_n, v_sum, v_look, v_emo,
             coalesce(extract(epoch from v_b.phase_ends_at)::bigint, 0),
             v_da, v_seat),
    'server_now', clock_timestamp()   -- 0189: Uhrabgleich
  );
end;
$$;

revoke all on function ks_room_sig(text) from public;
grant execute on function ks_room_sig(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) ks_sig — wie 0188, plus server_now
-- ─────────────────────────────────────────────────────────────
create or replace function ks_sig(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p   skill_participants;
  v_b   ks_boards;
  v_has boolean;
  v_me  int;
  v_n   int;
  v_sum bigint;
  v_emo bigint;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;
  v_b := ks_ensure_board(v_p.room_id);

  select exists(select 1 from ks_answers
                 where room_id = v_p.room_id
                   and question_idx = v_b.current_q_idx
                   and participant_id = v_p.id)
    into v_has;

  select count(*), coalesce(sum(score), 0),
         coalesce(max(extract(epoch from last_emote_at))::bigint, 0)
    into v_n, v_sum, v_emo
    from ks_players
   where room_id = v_p.room_id
     and (participant_id = v_p.id or ks_present(participant_id));   -- 0188

  select score into v_me from ks_players where participant_id = v_p.id;

  return jsonb_build_object(
    'ok',  true,
    'sig', concat_ws(':',
             v_b.phase, v_b.current_q_idx, v_b.question_count,
             (case when v_has then '1' else '0' end),
             coalesce(v_me, 0), v_n, v_sum, v_emo,
             coalesce(extract(epoch from v_b.phase_ends_at)::bigint, 0)),
    'server_now', clock_timestamp()   -- 0189: Uhrabgleich
  );
end;
$$;

revoke all on function ks_sig(text) from public;
grant execute on function ks_sig(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) ks_answer — Grundlage 0178
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
  v_open    timestamptz;       -- Augenblick des Aufdeckens
  v_srv_ms  int;               -- Aufdecken → Ankunft am Server
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

  v_limit := greatest(1, coalesce(v_q.time_limit_sec, 20));                 -- 0189 c
  v_open  := coalesce(v_b.phase_ends_at - v_limit * interval '1 second', now());

  -- Vorlesezeit: erst mehr als 1 s vor dem Aufdecken ist „zu früh"   (0189 a)
  if now() < v_open - interval '1 second' then
    return jsonb_build_object('ok', false, 'error', 'reading_phase');
  end if;

  v_srv_ms := greatest(0, least(v_limit * 1000,
                (extract(epoch from (now() - v_open)) * 1000)::int));

  -- Gerätezeit, eingefasst in [Serverzeit − 1,5 s, Serverzeit]     (0189 b)
  v_ms := greatest(v_srv_ms - 1500, least(v_srv_ms, coalesce(p_response_ms, v_srv_ms)));
  v_ms := greatest(0, least(v_limit * 1000, v_ms));

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
