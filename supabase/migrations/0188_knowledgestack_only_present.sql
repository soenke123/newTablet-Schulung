-- ═══════════════════════════════════════════════════════════════
-- 0188 — Knowledge Stack: im ganzen Spiel nur, wer da ist
-- ═══════════════════════════════════════════════════════════════
-- Sönkes Wunsch: stillgelegte (und offline) Kinder tauchen in
-- Knowledge Stack nirgends mehr auf — nicht in der Lobby und nicht im
-- laufenden Quiz. Zu sehen ist nur, wer online ist.
--
-- 0187 hat das nur für die Lobby-Wiese gemacht und im Quiz bewusst
-- alle stehen lassen („wer kurz offline ist, verliert seinen Platz auf
-- der Rangliste nicht"). Das fällt hier weg:
--
--   dabei   removed_at is null, nicht stillgelegt, in den letzten
--           90 s gesehen (dieselbe Regel wie skill_absent_json, 0187)
--
-- Gilt jetzt überall, wo Spieler gezeigt oder gezählt werden:
--   · ks_room_get (Beamer): players, leaderboard (Plätze 1…5),
--     answers_dist / answers_total — in JEDER Phase
--   · ks_view (Tablet): Rang, Nachbar davor/dahinter, player_count.
--     Das eigene Gerät zählt immer mit — es fragt ja gerade.
--   · ks_room_sig / ks_sig: die Zahl der Anwesenden steht in der
--     Signatur, sonst merkt der Beamer nicht, dass jemand stillgelegt
--     wurde oder gegangen ist.
--
-- Gelöscht wird nichts: Punkte und Antworten bleiben in ks_players /
-- ks_answers. Wer wieder freigegeben wird oder zurückkommt, steht mit
-- seinen Punkten wieder da.
--
-- ks_room_get ist ab hier wieder eine ganze Funktion (Grundlage 0186
-- plus die Listen aus 0187), kein Vorbau mehr. _ks_room_get_v186
-- bleibt liegen, wird aber nicht mehr gerufen.
--
-- Kein DROP, kein ALTER. Mehrfach ausführbar.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) ks_present — wer im Spiel zu sehen ist
-- ─────────────────────────────────────────────────────────────
create or replace function ks_present(p_participant uuid)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select exists (
    select 1 from skill_participants sp
     where sp.id = p_participant
       and sp.removed_at is null
       and not sp.blocked
       and sp.last_seen_at > now() - interval '90 seconds'
  );
$$;

revoke all on function ks_present(uuid) from public;

comment on function ks_present(uuid) is
  'Knowledge Stack (0188): ein Spieler ist zu sehen, wenn er nicht entfernt, nicht stillgelegt '
  'und in den letzten 90 s gesehen ist. Gilt in Lobby UND Quiz.';


-- ─────────────────────────────────────────────────────────────
-- 2) ks_room_get — Beamer, nur Anwesende, in jeder Phase
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0186, Wort für Wort, mit drei Änderungen (markiert
-- „0188"): ranked filtert auf ks_present, die Antwortzählung auch,
-- und offline_members / blocked_members aus 0187 hängen hinten dran.
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
  v_abs     jsonb;
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
         and ks_present(participant_id)                     -- 0188
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
       and sp.removed_at is null                            -- 0188
       and not sp.blocked                                   -- 0188
       and sp.last_seen_at > now() - interval '90 seconds'  -- 0188
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

  v_abs := skill_absent_json(v_room);                      -- 0187

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
                        'qid',              v_q.id,
                        'has_image',        (v_q.image is not null),
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
    'players',        v_players,
    'offline_members', coalesce((select jsonb_agg(x->'name') from jsonb_array_elements(v_abs->'offline') x), '[]'::jsonb),
    'blocked_members', coalesce((select jsonb_agg(x->'name') from jsonb_array_elements(v_abs->'blocked') x), '[]'::jsonb)
  );
end;
$$;

revoke all on function ks_room_get(text) from public;
grant execute on function ks_room_get(text) to authenticated;

comment on function ks_room_get(text) is
  'Beamer-Ansicht von Knowledge Stack. Seit 0188 in JEDER Phase nur Spieler, die online und '
  'nicht stillgelegt sind (Wiese, Rangliste, Antwortzählung); dazu offline_members und '
  'blocked_members (0187).';


-- ─────────────────────────────────────────────────────────────
-- 3) ks_view — Tablet: Rang und Nachbarn unter Anwesenden
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0176, Wort für Wort. Neu (markiert „0188"): ranked und
-- player_count zählen nur Anwesende — und das eigene Gerät, damit
-- „me" immer einen Rang hat.
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
       and (p.participant_id = v_p.id or ks_present(p.participant_id))   -- 0188
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
    'player_count',   (select count(*) from ks_players p                     -- 0188
                        where p.room_id = v_p.room_id
                          and (p.participant_id = v_p.id or ks_present(p.participant_id))),
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


-- ─────────────────────────────────────────────────────────────
-- 4) ks_room_sig — die Anwesenden stehen in der Signatur
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0175. Neu: Anzahl und Sitzplatz-Summe der Anwesenden.
-- Ohne das bliebe ein gerade stillgelegtes Kind am Beamer stehen,
-- bis sich sonst etwas ändert (stilllegen ändert an ks_players nichts).
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
             v_da, v_seat)
  );
end;
$$;

revoke all on function ks_room_sig(text) from public;
grant execute on function ks_room_sig(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) ks_sig — dasselbe fürs Tablet (Rang und Nachbarn)
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0175. Gezählt und summiert wird nur über Anwesende
-- (und das eigene Gerät) — genau die Menge, aus der ks_view den
-- Rang rechnet.
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
             coalesce(extract(epoch from v_b.phase_ends_at)::bigint, 0))
  );
end;
$$;

revoke all on function ks_sig(text) from public;
grant execute on function ks_sig(text) to anon, authenticated;
