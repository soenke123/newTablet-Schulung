-- ══════════════════════════════════════════════════════════════
-- Migration 0186 — Knowledge Stack: Fotos je Frage, Quiz beenden
--                  und neu starten
-- ══════════════════════════════════════════════════════════════
--
--  1) ks_questions.image / image_name — ein Foto je Frage, als
--     data:-URL (der Editor verkleinert es vorher auf höchstens
--     1600 Punkte Kantenlänge, JPEG). Kein Storage-Bucket: es gibt im
--     Projekt keinen, und ein Bild je Frage ist klein genug für die
--     Zeile. Obergrenze 1,5 MB Text.
--
--  2) ks_catalog_get / _save / _delete nehmen Bild und Namen mit.
--     Dazu je eine Fassung MIT p_code vorn: presenterActions
--     (lib/tool.js) hängt p_code an JEDEN Aufruf, und PostgREST sucht
--     die Funktion über die Namen aller Parameter. Ohne diese
--     Fassungen fand der Server ks_catalog_get(p_code, p_catalog_id)
--     nicht („fn_missing"). Die alten Fassungen bleiben, die Prüfstände
--     rufen sie direkt.
--
--  3) ks_room_image(p_code) — das Foto der LAUFENDEN Frage, nur für
--     den Beamer (ks_owned_room). ks_room_get sagt nur `has_image`
--     und `qid`: das Bild hängt nicht an der Ansicht, die bei jeder
--     Antwort neu geholt wird, sondern wird einmal je Frage geladen.
--     ks_view (Tablet) bekommt KEIN Bild — auch nicht das Wissen,
--     dass es eines gibt.
--
--  4) ks_finish(p_code) — Quiz vorzeitig beenden, direkt zur
--     Siegerehrung (Phase 'ended').
--
--  5) ks_restart(p_code) — Quiz neu starten: Punkte auf null, ab
--     Frage 1. Aus jeder Phase.
--
-- Kein DROP, kein ALTER an bestehenden Spalten.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalten image, image_name
-- ─────────────────────────────────────────────────────────────
alter table ks_questions add column if not exists image      text default null;
alter table ks_questions add column if not exists image_name text default null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ks_questions_image_chk') then
    alter table ks_questions add constraint ks_questions_image_chk
      check (image is null or (image like 'data:image/%' and length(image) <= 1500000));
  end if;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2a) ks_catalog_get — mit Bild
-- ─────────────────────────────────────────────────────────────
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
    'image',           q.image,
    'image_name',      q.image_name,
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

create or replace function ks_catalog_get(p_code text, p_catalog_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
as $$ select ks_catalog_get(p_catalog_id) $$;

revoke all on function ks_catalog_get(text, uuid) from public;
grant execute on function ks_catalog_get(text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2b) ks_catalog_save — mit Bild
-- ─────────────────────────────────────────────────────────────
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
  v_img  text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_title is null or trim(p_title) = '' then
    return jsonb_build_object('ok', false, 'error', 'title_required');
  end if;

  -- Bilder vorab prüfen: lieber eine klare Meldung als ein halb
  -- gespeicherter Katalog, der am CHECK der Tabelle abbricht.
  if p_questions is not null and jsonb_typeof(p_questions) = 'array' then
    if exists (select 1 from jsonb_array_elements(p_questions) e
                where nullif(e->>'image', '') is not null
                  and (e->>'image' not like 'data:image/%'
                       or length(e->>'image') > 1500000)) then
      return jsonb_build_object('ok', false, 'error', 'image_too_big');
    end if;
  end if;

  if p_catalog_id is null then
    insert into ks_catalogs (owner_id, title, subject)
    values (v_user, trim(p_title), coalesce(nullif(trim(p_subject), ''), 'Alles Mögliche'))
    returning id into v_cat;
  else
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

    delete from ks_questions where catalog_id = v_cat;
  end if;

  if p_questions is not null and jsonb_typeof(p_questions) = 'array' then
    for v_q in select * from jsonb_array_elements(p_questions) loop
      v_opts := v_q->'options';

      v_ci := null;
      if v_q ? 'correct_indices' and jsonb_typeof(v_q->'correct_indices') = 'array' then
        select array_agg(el::smallint)
          into v_ci
          from jsonb_array_elements_text(v_q->'correct_indices') el;
      end if;

      v_img := nullif(v_q->>'image', '');

      insert into ks_questions (
        catalog_id, question_text, options, correct_idx,
        correct_indices, time_limit_sec, explanation, sort_order,
        image, image_name
      ) values (
        v_cat,
        coalesce(v_q->>'question_text', ''),
        coalesce(v_opts, '["","","",""]'::jsonb),
        coalesce((v_q->>'correct_idx')::smallint, 0),
        v_ci,
        coalesce((v_q->>'time_limit_sec')::int, 20),
        v_q->>'explanation',
        v_i,
        v_img,
        case when v_img is null then null
             else left(coalesce(nullif(trim(v_q->>'image_name'), ''), 'Foto'), 200) end
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

create or replace function ks_catalog_save(
  p_code       text,
  p_catalog_id uuid,
  p_title      text,
  p_subject    text,
  p_questions  jsonb
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language sql
as $$ select ks_catalog_save(p_catalog_id, p_title, p_subject, p_questions) $$;

revoke all on function ks_catalog_save(text, uuid, text, text, jsonb) from public;
grant execute on function ks_catalog_save(text, uuid, text, text, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2c) ks_catalog_delete — Fassung mit p_code
-- ─────────────────────────────────────────────────────────────
create or replace function ks_catalog_delete(p_code text, p_catalog_id uuid)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language sql
as $$ select ks_catalog_delete(p_catalog_id) $$;

revoke all on function ks_catalog_delete(text, uuid) from public;
grant execute on function ks_catalog_delete(text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) ks_room_image — das Foto der laufenden Frage (nur Beamer)
-- ─────────────────────────────────────────────────────────────
create or replace function ks_room_image(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := ks_owned_room(p_code);
  v_b    ks_boards;
  v_q    ks_questions;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_b from ks_boards where room_id = v_room;
  if v_b.room_id is null or v_b.phase = 'lobby' then
    return jsonb_build_object('ok', true, 'qid', null, 'image', null);
  end if;

  select * into v_q from ks_questions
   where catalog_id = v_b.catalog_id
   order by sort_order, id offset v_b.current_q_idx limit 1;

  return jsonb_build_object('ok', true, 'qid', v_q.id, 'image', v_q.image);
end;
$$;

revoke all on function ks_room_image(text) from public;
grant execute on function ks_room_image(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3b) ks_room_get — has_image und qid an der Frage
-- ─────────────────────────────────────────────────────────────
-- Unverändert gegenüber 0176 bis auf die zwei Felder in 'question'.
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
    'players',        v_players
  );
end;
$$;

revoke all on function ks_room_get(text) from public;
grant execute on function ks_room_get(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) ks_finish — vorzeitig zur Siegerehrung
-- ─────────────────────────────────────────────────────────────
-- Aus 'question' heraus zählen die schon abgegebenen Antworten
-- dieser Frage mit (die Punkte stehen bereits in ks_players).
create or replace function ks_finish(p_code text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := ks_owned_room(p_code);
  v_b    ks_boards;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  perform pg_advisory_xact_lock(hashtext(v_room::text));
  v_b := ks_ensure_board(v_room);

  if v_b.phase not in ('question', 'reveal', 'podium') then
    return jsonb_build_object('ok', true, 'stale', true, 'phase', v_b.phase);
  end if;

  update ks_boards
     set phase = 'ended', ended_at = now(), phase_ends_at = null
   where room_id = v_room;

  return jsonb_build_object('ok', true, 'phase', 'ended');
end;
$$;

revoke all on function ks_finish(text) from public;
grant execute on function ks_finish(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) ks_restart — dasselbe Quiz noch einmal von vorn
-- ─────────────────────────────────────────────────────────────
-- Zurück in die Lobby und von dort mit ks_step los: das Nullen der
-- Punkte, das Löschen der Antworten und die Vorlesezeit stehen dann
-- an genau einer Stelle (0178).
create or replace function ks_restart(p_code text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := ks_owned_room(p_code);
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  perform pg_advisory_xact_lock(hashtext(v_room::text));
  perform ks_ensure_board(v_room);

  update ks_boards
     set phase         = 'lobby',
         current_q_idx = 0,
         phase_ends_at = null,
         started_at    = null,
         ended_at      = null
   where room_id = v_room;

  return ks_step(p_code, 'lobby');
end;
$$;

revoke all on function ks_restart(text) from public;
grant execute on function ks_restart(text) to authenticated;
