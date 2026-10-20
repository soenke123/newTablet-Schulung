-- ══════════════════════════════════════════════════════════════
-- Migration 0217 — Knowledge Stack: drei neue Fragetypen
-- ══════════════════════════════════════════════════════════════
-- Bisher gab es nur Auswahl (A–D, schnell sein lohnt sich). Neu:
--
--   tf     Wahr oder falsch. Zwei Antworten, im Editor vorbelegt mit
--          „Wahr" / „Falsch", aber änderbar. Gewertet wie Auswahl
--          (ks_answer, Tempo zählt).
--
--   scale  Skala. Die Lehrkraft gibt Start, Ende und Ziel (dazu eine
--          Einheit) an, das Kind schiebt einen Regler. Punkte gibt es
--          für die NÄHE zum Ziel, nicht fürs Tempo: genau getroffen
--          1000, dann fällt es exponentiell, und ab 30 % der Spanne
--          (Ende − Start) daneben gibt es 0. Neuer Aufruf
--          ks_answer_scale, einmal je Frage.
--
--   bet    Münzen setzen. Jedes Kind hat 5 Münzen à 200 Punkte und
--          verteilt sie frei auf die (bis zu) vier Antworten — bis die
--          Uhr abläuft, beliebig oft umsetzen. Es zählen nur Münzen
--          auf richtigen Antworten. Neuer Aufruf ks_bet.
--
-- ── Münzen: Punkte erst nach der Frage ───────────────────────
-- Wer umsetzen darf, darf nicht sehen, was eine Münze gerade wert
-- ist — sonst schiebt man sie hin und her, bis der Punktestand oben
-- steigt. Deshalb steht beim Setzen nur points_awarded in der Antwort
-- (settled_pts = was davon schon in ks_players.score steckt), und
-- ks_players.score wächst erst, wenn die Frage vorbei ist: ks_settle
-- bucht die Differenz, aufgerufen von ks_view, ks_room_get und ks_step
-- (jeder Weg, auf dem jemand die Auflösung sieht oder weiterschaltet).
-- ks_view verschweigt während der Frage is_correct und Punkte.
-- settled_pts ist NULL bei Auswahl/Skala (die buchen sofort, wie
-- bisher) — ks_settle fasst nur Zeilen mit settled_pts an.
--
-- ── Vorbauten statt Abschriften ───────────────────────────────
-- ks_catalog_save, ks_answer, ks_room_get, ks_view und ks_step werden
-- wie in 0194 umbenannt (_…_v194/_v189/_v188/_v195) und bekommen einen
-- Vorbau, der nur ergänzt. Mehrfach ausführbar.
--
-- Prüfstand: supabase/tests/0217_knowledgestack_fragetypen.mjs
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalten
-- ─────────────────────────────────────────────────────────────
alter table ks_questions add column if not exists kind  text not null default 'mc';
alter table ks_questions add column if not exists scale jsonb default null;  -- {min, max, target, step, unit}

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ks_questions_kind_chk') then
    alter table ks_questions add constraint ks_questions_kind_chk
      check (kind in ('mc', 'tf', 'scale', 'bet'));
  end if;
end $$;

alter table ks_answers add column if not exists value       numeric  default null;  -- scale
alter table ks_answers add column if not exists bets        smallint[] default null; -- bet: Münzen je Antwort
alter table ks_answers add column if not exists settled_pts int      default null;  -- bet: schon gebucht

comment on column ks_questions.kind is
  'Fragetyp (0217): mc = Auswahl, tf = Wahr/Falsch, scale = Skala (Regler), bet = Münzen setzen.';
comment on column ks_questions.scale is
  'Nur bei kind = scale: {"min":…, "max":…, "target":…, "step":…, "unit":"…"} (0217). step = Rasterung des Reglers.';


-- ─────────────────────────────────────────────────────────────
-- 2) Punkte auf der Skala
-- ─────────────────────────────────────────────────────────────
-- x = Abstand zum Ziel / (30 % der Spanne). 1000 · (e^(−3x) − e^(−3)) /
-- (1 − e^(−3)): bei x = 0 genau 1000, bei x = 1 genau 0 (kein Sprung
-- am Rand), dazwischen exponentiell fallend (x = .1 → 727, .5 → 183).
create or replace function ks_scale_points(p_value numeric, p_min numeric, p_max numeric, p_target numeric)
  returns int
  immutable
  language plpgsql
as $$
declare
  v_lim numeric := (p_max - p_min) * 0.3;
  v_x   numeric;
begin
  if p_value is null or v_lim is null or v_lim <= 0 then return 0; end if;
  v_x := abs(p_value - p_target) / v_lim;
  if v_x >= 1 then return 0; end if;
  return greatest(0, round(1000 * (exp(-3 * v_x) - exp(-3::numeric)) / (1 - exp(-3::numeric))))::int;
end;
$$;

grant execute on function ks_scale_points(numeric, numeric, numeric, numeric) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Die aktuelle Frage eines Bretts (Helfer der Vorbauten)
-- ─────────────────────────────────────────────────────────────
create or replace function ks_current_question(p_b ks_boards)
  returns ks_questions
  stable
  security definer
  set search_path = public
  language sql
as $$
  select q.* from ks_questions q
   where q.catalog_id = p_b.catalog_id
   order by q.sort_order, q.id offset p_b.current_q_idx limit 1
$$;

revoke all on function ks_current_question(ks_boards) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) ks_settle — Münzpunkte buchen, wenn die Frage vorbei ist
-- ─────────────────────────────────────────────────────────────
-- Bucht je Zeile die Differenz points_awarded − settled_pts. Zwei
-- gleichzeitige Aufrufe zählen nicht doppelt: das UPDATE prüft die
-- Bedingung nach dem Zeilenschloss neu.
create or replace function ks_settle(p_room uuid)
  returns void
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b ks_boards;
begin
  select * into v_b from ks_boards where room_id = p_room;
  if v_b.room_id is null then return; end if;

  with s as (
    update ks_answers a
       set settled_pts = a.points_awarded
      from ks_answers o
     where o.id = a.id
       and a.room_id = p_room
       and a.settled_pts is not null
       and a.settled_pts <> a.points_awarded
       and not (v_b.phase = 'question' and a.question_idx = v_b.current_q_idx)
    returning a.participant_id, a.points_awarded - o.settled_pts as diff
  )
  update ks_players p
     set score = p.score + t.diff
    from (select participant_id, sum(diff)::int as diff from s group by participant_id) t
   where p.participant_id = t.participant_id;
end;
$$;

revoke all on function ks_settle(uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) ks_catalog_save — Vorbau: kind und scale
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_ks_catalog_save_v194') then
    alter function ks_catalog_save(uuid, text, text, jsonb, text, text, boolean)
      rename to _ks_catalog_save_v194;
  end if;
end $$;

revoke all on function _ks_catalog_save_v194(uuid, text, text, jsonb, text, text, boolean)
  from public, anon, authenticated;

create or replace function ks_catalog_save(
  p_catalog_id  uuid,
  p_title       text,
  p_subject     text,
  p_questions   jsonb,
  p_visibility  text    default null,
  p_thumbnail   text    default null,
  p_thumb_custom boolean default false
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_qs   jsonb := p_questions;
  v_out  jsonb := '[]'::jsonb;
  v_q    jsonb;
  v_kind text;
  v_s    jsonb;
  v_min  numeric;
  v_max  numeric;
  v_tgt  numeric;
  v_step numeric;
  v_r    jsonb;
  v_i    int := 0;
begin
  -- Erst prüfen und aufräumen, dann speichern: ein Fehler soll nichts
  -- halb geschrieben zurücklassen.
  if v_qs is not null and jsonb_typeof(v_qs) = 'array' then
    for v_q in select * from jsonb_array_elements(v_qs) loop
      v_kind := coalesce(nullif(v_q->>'kind', ''), 'mc');
      if v_kind not in ('mc', 'tf', 'scale', 'bet') then v_kind := 'mc'; end if;

      if v_kind = 'scale' then
        v_s := v_q->'scale';
        begin
          v_min := (v_s->>'min')::numeric;
          v_max := (v_s->>'max')::numeric;
          v_tgt := (v_s->>'target')::numeric;
          v_step := nullif(v_s->>'step', '')::numeric;
        exception when others then
          return jsonb_build_object('ok', false, 'error', 'bad_scale');
        end;
        if v_min is null or v_max is null or v_tgt is null or v_min >= v_max
           or v_tgt < v_min or v_tgt > v_max then
          return jsonb_build_object('ok', false, 'error', 'bad_scale');
        end if;
        v_q := v_q || jsonb_build_object(
                 'options', '[]'::jsonb, 'correct_idx', 0, 'correct_indices', '[0]'::jsonb,
                 'scale', jsonb_build_object('min', v_min, 'max', v_max, 'target', v_tgt,
                            'step', case when v_step > 0 and v_step <= v_max - v_min then v_step end,
                            'unit', left(btrim(coalesce(v_s->>'unit', '')), 20)));
      elsif v_kind = 'tf' then
        v_q := v_q || jsonb_build_object(
                 'options', jsonb_build_array(
                              coalesce(nullif(btrim(v_q->'options'->>0), ''), 'Wahr'),
                              coalesce(nullif(btrim(v_q->'options'->>1), ''), 'Falsch')),
                 'correct_idx', case when (v_q->>'correct_idx') = '1' then 1 else 0 end,
                 'correct_indices', jsonb_build_array(case when (v_q->>'correct_idx') = '1' then 1 else 0 end),
                 'scale', null);
      else
        v_q := v_q || jsonb_build_object('scale', null);
      end if;
      v_out := v_out || jsonb_build_array(v_q || jsonb_build_object('kind', v_kind));
    end loop;
    v_qs := v_out;
  end if;

  v_r := _ks_catalog_save_v194(p_catalog_id, p_title, p_subject, v_qs,
                               p_visibility, p_thumbnail, p_thumb_custom);
  if coalesce((v_r->>'ok')::boolean, false) is not true then return v_r; end if;

  if v_qs is not null and jsonb_typeof(v_qs) = 'array' then
    for v_q in select * from jsonb_array_elements(v_qs) loop
      update ks_questions
         set kind  = v_q->>'kind',
             scale = case when jsonb_typeof(v_q->'scale') = 'object' then v_q->'scale' else null end
       where catalog_id = (v_r->>'catalog_id')::uuid and sort_order = v_i;
      v_i := v_i + 1;
    end loop;
  end if;

  return v_r;
end;
$$;

revoke all on function ks_catalog_save(uuid, text, text, jsonb, text, text, boolean) from public;
grant execute on function ks_catalog_save(uuid, text, text, jsonb, text, text, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) ks_catalog_get — mit kind und scale (Grundlage 0194)
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
  select * into v_cat from ks_catalogs where id = p_catalog_id;

  if v_cat.id is null or not ks_catalog_can_see(v_cat) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',              q.id,
    'kind',            q.kind,                 -- 0217
    'scale',           q.scale,                -- 0217
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
    'ok',           true,
    'catalog_id',   v_cat.id,
    'title',        v_cat.title,
    'subject',      v_cat.subject,
    'is_template',  v_cat.is_template,
    'visibility',   v_cat.visibility,
    'mine',         (v_cat.owner_id = v_user),
    'thumbnail',    v_cat.thumbnail,
    'thumb_custom', v_cat.thumb_custom,
    'questions',    v_qs
  );
end;
$$;

revoke all on function ks_catalog_get(uuid) from public;
grant execute on function ks_catalog_get(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) ks_answer — Vorbau: nur für Auswahl und Wahr/Falsch
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_ks_answer_v189') then
    alter function ks_answer(text, int, smallint, int) rename to _ks_answer_v189;
  end if;
end $$;

revoke all on function _ks_answer_v189(text, int, smallint, int) from public, anon, authenticated;

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
  v_p skill_participants;
  v_b ks_boards;
  v_q ks_questions;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is not null then
    select * into v_b from ks_boards where room_id = v_p.room_id;
    if v_b.room_id is not null and v_b.current_q_idx = p_question_idx then
      v_q := ks_current_question(v_b);
      if v_q.kind in ('scale', 'bet') then
        return jsonb_build_object('ok', false, 'error', 'wrong_kind');
      end if;
    end if;
  end if;
  return _ks_answer_v189(p_token, p_question_idx, p_chosen, p_response_ms);
end;
$$;

revoke all on function ks_answer(text, int, smallint, int) from public;
grant execute on function ks_answer(text, int, smallint, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) ks_answer_scale — der Regler, einmal je Frage
-- ─────────────────────────────────────────────────────────────
-- Prüfungen wie ks_answer (0189): Phase, Uhr (+1 s Kulanz),
-- Vorlesezeit, schon geantwortet. Der Wert wird in [min, max]
-- geklemmt. Das Tempo zählt nicht, die Serie bleibt, wie sie ist.
create or replace function ks_answer_scale(
  p_token        text,
  p_question_idx int,
  p_value        numeric
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p      skill_participants;
  v_b      ks_boards;
  v_q      ks_questions;
  v_limit  int;
  v_open   timestamptz;
  v_ms     int;
  v_min    numeric;
  v_max    numeric;
  v_val    numeric;
  v_points int;
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
               and question_idx = p_question_idx and participant_id = v_p.id) then
    return jsonb_build_object('ok', false, 'error', 'already_answered');
  end if;

  perform ks_ensure_player(v_p.id, v_p.room_id);
  v_q := ks_current_question(v_b);
  if v_q.id is null then return jsonb_build_object('ok', false, 'error', 'question_not_found'); end if;
  if v_q.kind <> 'scale' or v_q.scale is null then
    return jsonb_build_object('ok', false, 'error', 'wrong_kind');
  end if;
  if p_value is null then return jsonb_build_object('ok', false, 'error', 'invalid_input'); end if;

  v_limit := greatest(1, coalesce(v_q.time_limit_sec, 20));
  v_open  := coalesce(v_b.phase_ends_at - v_limit * interval '1 second', now());
  if now() < v_open - interval '1 second' then
    return jsonb_build_object('ok', false, 'error', 'reading_phase');
  end if;
  v_ms := greatest(0, least(v_limit * 1000, (extract(epoch from (now() - v_open)) * 1000)::int));

  v_min := (v_q.scale->>'min')::numeric;
  v_max := (v_q.scale->>'max')::numeric;
  v_val := greatest(v_min, least(v_max, p_value));
  v_points := ks_scale_points(v_val, v_min, v_max, (v_q.scale->>'target')::numeric);

  insert into ks_answers (room_id, question_idx, participant_id, chosen_idx,
                          is_correct, response_ms, points_awarded, value)
  values (v_p.room_id, p_question_idx, v_p.id, 0, v_points > 0, v_ms, v_points, v_val);

  update ks_players set score = score + v_points where participant_id = v_p.id;

  return jsonb_build_object('ok', true, 'value', v_val);
end;
$$;

revoke all on function ks_answer_scale(text, int, numeric) from public;
grant execute on function ks_answer_scale(text, int, numeric) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 9) ks_bet — Münzen setzen und umsetzen, bis die Uhr abläuft
-- ─────────────────────────────────────────────────────────────
-- p_bets: Münzen je Antwort, z. B. [3,1,1,0]. Höchstens 5 zusammen,
-- keine negativen, nicht mehr Felder als Antworten. Jeder Aufruf
-- ersetzt den letzten Stand. Alle Münzen zurück = keine Antwort.
-- Die Antwort verrät nichts über richtig/falsch.
create or replace function ks_bet(
  p_token        text,
  p_question_idx int,
  p_bets         jsonb
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p      skill_participants;
  v_b      ks_boards;
  v_q      ks_questions;
  v_old    ks_answers;
  v_bets   smallint[];
  v_n      int;
  v_sum    int;
  v_ci     smallint[];
  v_points int := 0;
  v_top    int := 0;
  v_limit  int;
  v_open   timestamptz;
  v_ms     int;
  i        int;
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

  perform ks_ensure_player(v_p.id, v_p.room_id);
  v_q := ks_current_question(v_b);
  if v_q.id is null then return jsonb_build_object('ok', false, 'error', 'question_not_found'); end if;
  if v_q.kind <> 'bet' then return jsonb_build_object('ok', false, 'error', 'wrong_kind'); end if;

  v_limit := greatest(1, coalesce(v_q.time_limit_sec, 20));
  v_open  := coalesce(v_b.phase_ends_at - v_limit * interval '1 second', now());
  if now() < v_open - interval '1 second' then
    return jsonb_build_object('ok', false, 'error', 'reading_phase');
  end if;
  v_ms := greatest(0, least(v_limit * 1000, (extract(epoch from (now() - v_open)) * 1000)::int));

  -- Eingabe prüfen
  v_n := jsonb_array_length(v_q.options);
  if p_bets is null or jsonb_typeof(p_bets) <> 'array' or jsonb_array_length(p_bets) > v_n then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  begin
    select array_agg(coalesce(e::smallint, 0) order by o) into v_bets
      from jsonb_array_elements_text(p_bets) with ordinality as t(e, o);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end;
  v_bets := coalesce(v_bets, '{}'::smallint[]);
  while coalesce(array_length(v_bets, 1), 0) < 4 loop v_bets := v_bets || 0::smallint; end loop;
  select coalesce(sum(x), 0), coalesce(min(x), 0) into v_sum, i from unnest(v_bets) x;
  if i < 0 or v_sum > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_ci := coalesce(v_q.correct_indices, array[v_q.correct_idx]);
  for i in 1 .. 4 loop
    if (i - 1)::smallint = any(v_ci) then v_points := v_points + 200 * v_bets[i]; end if;
    if v_bets[i] > v_bets[v_top + 1] then v_top := i - 1; end if;
  end loop;

  select * into v_old from ks_answers
   where room_id = v_p.room_id and question_idx = p_question_idx and participant_id = v_p.id;

  if v_sum = 0 then
    -- Alle Münzen zurück: keine Antwort mehr (gebucht ist noch nichts,
    -- die Frage läuft ja).
    delete from ks_answers where id = v_old.id and coalesce(settled_pts, 0) = 0;
    return jsonb_build_object('ok', true, 'coins', 0);
  end if;

  if v_old.id is null then
    insert into ks_answers (room_id, question_idx, participant_id, chosen_idx,
                            is_correct, response_ms, points_awarded, bets, settled_pts)
    values (v_p.room_id, p_question_idx, v_p.id, v_top,
            v_points > 0, v_ms, v_points, v_bets, 0);
  else
    update ks_answers
       set chosen_idx = v_top, is_correct = v_points > 0, response_ms = v_ms,
           points_awarded = v_points, bets = v_bets, answered_at = now(),
           settled_pts = coalesce(settled_pts, 0)
     where id = v_old.id;
  end if;

  return jsonb_build_object('ok', true, 'coins', v_sum);
end;
$$;

revoke all on function ks_bet(text, int, jsonb) from public;
grant execute on function ks_bet(text, int, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 10) ks_room_get — Vorbau: Typ, Skala, Münzverteilung
-- ─────────────────────────────────────────────────────────────
-- question.kind, question.scale (Ziel erst in der Auflösung).
-- In der Auflösung zusätzlich:
--   scale: scale_values = alle Werte der Anwesenden
--   bet:   answers_dist = MÜNZEN je Antwort (statt Köpfen),
--          bet_coins    = Münzen zusammen
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_ks_room_get_v194') then
    alter function ks_room_get(text) rename to _ks_room_get_v194;
  end if;
end $$;

revoke all on function _ks_room_get_v194(text) from public, anon, authenticated;

create or replace function ks_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   uuid := ks_owned_room(p_code);
  v        jsonb;
  v_b      ks_boards;
  v_q      ks_questions;
  v_reveal boolean;
  v_s      jsonb;
  v_dist   jsonb;
  v_coins  int;
begin
  if v_room is not null then
    v_b := ks_ensure_board(v_room);
    perform ks_settle(v_room);
  end if;

  v := _ks_room_get_v194(p_code);
  if coalesce((v->>'ok')::boolean, false) is not true or v_room is null
     or jsonb_typeof(v->'question') <> 'object' then
    return v;
  end if;

  select * into v_b from ks_boards where room_id = v_room;
  v_q := ks_current_question(v_b);
  if v_q.id is null then return v; end if;
  v_reveal := v_b.phase in ('reveal', 'podium', 'ended');

  v_s := case when v_q.kind = 'scale' and v_q.scale is not null then
           case when v_reveal then v_q.scale else v_q.scale - 'target' end
         else null end;
  v := jsonb_set(v, '{question}', (v->'question') || jsonb_build_object('kind', v_q.kind, 'scale', v_s));

  if v_reveal and v_q.kind = 'scale' then
    v := v || jsonb_build_object('scale_values', coalesce((
           select jsonb_agg(a.value order by a.value)
             from ks_answers a
            where a.room_id = v_room and a.question_idx = v_b.current_q_idx
              and a.value is not null and ks_present(a.participant_id)), '[]'::jsonb));
  end if;

  if v_q.kind = 'bet' then
    if v_reveal then
      select coalesce(jsonb_object_agg(k - 1, c), '{}'::jsonb), coalesce(sum(c), 0)
        into v_dist, v_coins
        from (
          select k, sum(a.bets[k])::int as c
            from ks_answers a, generate_series(1, 4) k
           where a.room_id = v_room and a.question_idx = v_b.current_q_idx
             and a.bets is not null and ks_present(a.participant_id)
           group by k
        ) t;
    else
      v_dist := '{}'::jsonb; v_coins := 0;           -- während der Frage: nichts verraten
    end if;
    v := v || jsonb_build_object('answers_dist', v_dist, 'bet_coins', v_coins);
  end if;

  return v;
end;
$$;

revoke all on function ks_room_get(text) from public;
grant execute on function ks_room_get(text) to authenticated;

comment on function ks_room_get(text) is
  'Beamer-Ansicht von Knowledge Stack (Fassung 0194 als _ks_room_get_v194). Seit 0217 mit '
  'question.kind/scale, scale_values und Münzverteilung; bucht vorher Münzpunkte (ks_settle).';


-- ─────────────────────────────────────────────────────────────
-- 11) ks_view — Vorbau: Typ, Skala, eigene Münzen/eigener Wert
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_ks_view_v188') then
    alter function ks_view(text) rename to _ks_view_v188;
  end if;
end $$;

revoke all on function _ks_view_v188(text) from public, anon, authenticated;

create or replace function ks_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p      skill_participants;
  v        jsonb;
  v_b      ks_boards;
  v_q      ks_questions;
  v_a      ks_answers;
  v_reveal boolean;
  v_s      jsonb;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is not null then
    v_b := ks_ensure_board(v_p.room_id);
    perform ks_settle(v_p.room_id);
  end if;

  v := _ks_view_v188(p_token);
  if coalesce((v->>'ok')::boolean, false) is not true or v_p.id is null
     or jsonb_typeof(v->'question') <> 'object' then
    return v;
  end if;

  select * into v_b from ks_boards where room_id = v_p.room_id;
  v_q := ks_current_question(v_b);
  if v_q.id is null then return v; end if;
  v_reveal := v_b.phase in ('reveal', 'podium', 'ended');

  v_s := case when v_q.kind = 'scale' and v_q.scale is not null then
           case when v_reveal then v_q.scale else v_q.scale - 'target' end
         else null end;
  v := jsonb_set(v, '{question}', (v->'question') || jsonb_build_object('kind', v_q.kind, 'scale', v_s));

  if jsonb_typeof(v->'my_answer') = 'object' then
    select * into v_a from ks_answers
     where room_id = v_p.room_id and question_idx = v_b.current_q_idx and participant_id = v_p.id;
    v := jsonb_set(v, '{my_answer}', (v->'my_answer') || jsonb_build_object(
           'value', v_a.value,
           'bets',  to_jsonb(v_a.bets)));
    -- Münzen: während der Frage weder richtig/falsch noch Punkte.
    if v_q.kind = 'bet' and not v_reveal then
      v := jsonb_set(v, '{my_answer}', (v->'my_answer')
             || jsonb_build_object('is_correct', null, 'points_awarded', null));
    end if;
  end if;

  return v;
end;
$$;

revoke all on function ks_view(text) from public;
grant execute on function ks_view(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 12) ks_step — Vorbau: vor und nach dem Schritt buchen
-- ─────────────────────────────────────────────────────────────
-- Vorher: prev_score = score (Auflösung → nächste Frage) muss die
-- Münzen schon enthalten. Nachher: Frage → Auflösung bucht sofort.
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_ks_step_v195') then
    alter function ks_step(text, text) rename to _ks_step_v195;
  end if;
end $$;

revoke all on function _ks_step_v195(text, text) from public, anon, authenticated;

create or replace function ks_step(p_code text, p_from text default null)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := ks_owned_room(p_code);
  v_r    jsonb;
begin
  if v_room is not null then
    perform pg_advisory_xact_lock(hashtext(v_room::text));
    perform ks_ensure_board(v_room);
    perform ks_settle(v_room);
  end if;
  v_r := _ks_step_v195(p_code, p_from);
  if v_room is not null then perform ks_settle(v_room); end if;
  return v_r;
end;
$$;

revoke all on function ks_step(text, text) from public;
grant execute on function ks_step(text, text) to authenticated;
