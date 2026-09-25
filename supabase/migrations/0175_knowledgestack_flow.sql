-- ══════════════════════════════════════════════════════════════
-- Migration 0175 — Knowledge Stack: der Ablauf, wie er am Beamer
--                  wirklich läuft
-- ══════════════════════════════════════════════════════════════
-- 0174 hat die Tische hingestellt. Diese Migration räumt den Ablauf
-- auf — sechs Entscheidungen, alle aus dem ersten Durchlauf:
--
--  1) EIN Auflösungsbild statt zwei. Bisher gab es 'reveal'
--     (Verteilung) und 'podium' (Rangliste) als getrennte Phasen,
--     und die Lehrkraft musste zwischen zwei Bildern klicken, die
--     zusammengehören. Jetzt trägt 'reveal' beides: oben die fünf
--     Ersten, unten die vier Antwortfelder als Füllstände. 'podium'
--     bleibt im CHECK stehen (kein DROP) und wird wie 'reveal'
--     behandelt — ein Raum, der mitten im Spiel auf diese Migration
--     trifft, läuft weiter.
--
--  2) Die Uhr läuft auf dem SERVER ab. Bisher rief die Beamer-Seite
--     bei 0 selbst `ks_advance` — wurde der Tab in den Hintergrund
--     geschoben, drosselte der Browser den Takt und die Frage blieb
--     offen. Jetzt schließt `ks_ensure_board` eine abgelaufene Frage
--     selbst; weil ALLE Leseaufrufe darüber gehen, tut das der
--     nächste Takt von irgendwem. Die Sekunde Kulanz aus `ks_answer`
--     gilt hier genauso — sonst verlöre die Antwort, die auf dem Weg
--     ist, gegen den Phasenwechsel.
--
--  3) `ks_step(code, from)` statt eines blinden `ks_advance`. Wer
--     weiterschaltet, sagt, WOHER er weiterschaltet; passt das nicht
--     mehr, ist der Klick alt und verpufft (`stale`). Ohne diese
--     Angabe sprang ein zweiter Klick auf „Jetzt auflösen" über die
--     Auflösung hinweg zur nächsten Frage. `ks_advance(text)` bleibt
--     als Hülle bestehen — die Signatur eines bestehenden Aufrufs
--     wird NICHT erweitert, sonst wäre der Aufruf mit einem Argument
--     mehrdeutig (PostgREST könnte ihn dann gar nicht mehr binden).
--
--  4) Rang-Delta, das etwas zeigt. `prev_score` wurde bisher beim
--     Betreten des Podiums gesetzt — also nachdem die Punkte der
--     Frage schon drauf waren. Damit war das Delta immer 0. Jetzt
--     wird es beim VERLASSEN der Auflösung gesetzt: während der
--     Auflösung ist `prev_score` der Stand vor dieser Frage, und
--     ▲/▼ zeigt, was diese Frage bewegt hat.
--
--  5) Emotes sind flüchtig und stören nicht. `last_emote` blieb für
--     immer stehen und wurde von `ks_answer` mit 'cheer'/'sad'
--     überschrieben — das Winken eines Kindes war weg, sobald es
--     antwortete, und am Beamer klebte ewig dasselbe Zeichen. Jetzt
--     schreibt `ks_answer` gar kein Emote mehr (richtig/falsch weiß
--     die Anzeige aus der Antwort selbst), und die Ansichten geben
--     ein Emote nur noch 3,5 Sekunden lang heraus.
--
--  6) Die Signaturen merken mehr. Bisher stand in `ks_sig`/
--     `ks_room_sig` nichts über Punkte, Emotes und Wesen — wer in
--     der Lobby sein Wesen wechselte oder in der Auflösung winkte,
--     erschien beim anderen erst beim nächsten Phasenwechsel. Jetzt
--     tragen beide Signaturen Punktsumme, Emote-Zeitstempel und eine
--     Wesen-Prüfzahl.
--
-- Dazu drei Register (`create index if not exists`) auf die Spalten,
-- über die jeder Takt geht.
--
-- Kein DROP, kein ALTER an bestehenden Spalten: alles läuft über
-- `create or replace function` und `create index if not exists`.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Register
-- ─────────────────────────────────────────────────────────────
-- Jeder Takt fragt „wer ist in diesem Raum" und „wer hat auf diese
-- Frage geantwortet". Bei 28 Kindern fällt ein Seq-Scan nicht auf;
-- bei drei parallelen Klassen auf derselben Tabelle schon.
create index if not exists ks_players_room_idx
  on ks_players (room_id);

create index if not exists ks_answers_room_q_idx
  on ks_answers (room_id, question_idx);

-- Die Frage zu einem Index wird mit `order by sort_order, id offset n
-- limit 1` geholt — genau die Reihenfolge, die hier steht.
create index if not exists ks_questions_catalog_order_idx
  on ks_questions (catalog_id, sort_order, id);


-- ─────────────────────────────────────────────────────────────
-- 2) Das Brett holen — und dabei die Uhr ablaufen lassen
-- ─────────────────────────────────────────────────────────────
-- Der eine Ort, an dem eine abgelaufene Frage geschlossen wird.
-- Absichtlich hier und nicht in einem eigenen `ks_tick`: alle vier
-- Leseaufrufe (ks_sig, ks_view, ks_room_sig, ks_room_get) gehen
-- schon über diese Funktion, und `ks_answer` auch. Ein zweiter
-- Aufruf, den man vergessen könnte, wäre genau der, der im
-- Unterricht fehlt.
--
-- Die Sekunde Kulanz ist dieselbe wie in ks_answer: eine Antwort,
-- die beim Ablauf der Uhr gerade unterwegs ist, soll noch zählen.
-- Wäre sie hier kleiner, verlöre sie gegen den Phasenwechsel — und
-- das Kind sähe „zu spät", obwohl es rechtzeitig getippt hat.
create or replace function ks_ensure_board(p_room uuid)
  returns ks_boards
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b ks_boards;
  v_default_catalog uuid;
begin
  select * into v_b from ks_boards where room_id = p_room;

  if v_b.room_id is null then
    -- Standard-Katalog (Vorlage) als Rückfall, damit ein frisch
    -- angelegter Raum sofort spielbar ist.
    select id into v_default_catalog from ks_catalogs
     where is_template = true
     order by created_at asc limit 1;

    insert into ks_boards (room_id, catalog_id, question_count)
    values (
      p_room,
      v_default_catalog,
      coalesce((select count(*) from ks_questions where catalog_id = v_default_catalog), 0)
    )
    on conflict (room_id) do nothing
    returning * into v_b;

    -- Zwei Geräte im selben Augenblick: das zweite bekommt nichts
    -- aus RETURNING zurück und liest die Zeile des ersten.
    if v_b.room_id is null then
      select * into v_b from ks_boards where room_id = p_room;
    end if;
    return v_b;
  end if;

  if v_b.phase = 'question'
     and v_b.phase_ends_at is not null
     and now() > v_b.phase_ends_at + interval '1 second' then
    update ks_boards
       set phase = 'reveal',
           phase_ends_at = null
     where room_id = p_room
       and phase = 'question'          -- falls ein anderer schneller war
     returning * into v_b;

    if v_b.room_id is null then
      select * into v_b from ks_boards where room_id = p_room;
    end if;
  end if;

  return v_b;
end;
$$;

comment on function ks_ensure_board(uuid) is
  'Holt das Brett eines Raums, legt es beim ersten Mal an — und schließt '
  'eine abgelaufene Frage. Der einzige Ort, an dem die Uhr wirklich abläuft.';


-- ─────────────────────────────────────────────────────────────
-- 3) Weiterschalten
-- ─────────────────────────────────────────────────────────────
-- p_from ist die Phase, aus der die Lehrkraft heraus geklickt hat.
-- Stimmt sie nicht mehr, ist der Klick alt: das passiert, wenn die
-- Uhr im selben Augenblick abgelaufen ist oder wenn jemand zweimal
-- tippt. Dann geschieht NICHTS und die Antwort sagt das auch.
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

  -- Derselbe Riegel wie in ks_answer: zwei Klicks aus zwei Fenstern
  -- desselben Raums dürfen nicht zwei Phasen weiterspringen.
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

      -- Bei null anfangen, und zwar wirklich: auch prev_score und
      -- streak. Sonst trägt die erste Frage der neuen Runde noch
      -- den Rang-Sprung der letzten.
      update ks_players set score = 0, prev_score = 0, streak = 0,
                            last_emote = null, last_emote_at = null
       where room_id = v_room;
      delete from ks_answers where room_id = v_room;

      update ks_boards
         set phase          = 'question',
             current_q_idx  = 0,
             phase_ends_at  = now() + (v_q.time_limit_sec * interval '1 second'),
             question_count = coalesce((select count(*) from ks_questions
                                         where catalog_id = v_b.catalog_id), 0),
             started_at     = now(),
             ended_at       = null
       where room_id = v_room;

    when v_b.phase = 'question' then
      -- „Jetzt auflösen" — dasselbe, was die Uhr von selbst tut.
      update ks_boards
         set phase = 'reveal',
             phase_ends_at = null
       where room_id = v_room;

    -- 'podium' gibt es nicht mehr als eigenes Bild; ein Brett, das
    -- noch darin steht, verhält sich wie in der Auflösung.
    when v_b.phase in ('reveal', 'podium') then
      -- JETZT den Stand einfrieren, nicht früher: bis hierher war
      -- prev_score der Stand VOR dieser Frage, und genau daraus
      -- rechnet die Auflösung ihr ▲/▼.
      update ks_players set prev_score = score where room_id = v_room;

      v_next_idx := v_b.current_q_idx + 1;

      if v_next_idx < v_b.question_count then
        select * into v_q from ks_questions
         where catalog_id = v_b.catalog_id
         order by sort_order, id offset v_next_idx limit 1;

        if v_q.id is null then
          -- Der Katalog ist unter dem laufenden Spiel kürzer
          -- geworden. Kein Fehler für die Klasse: Schluss machen.
          update ks_boards
             set phase = 'ended', ended_at = now(), phase_ends_at = null
           where room_id = v_room;
        else
          update ks_boards
             set phase         = 'question',
                 current_q_idx = v_next_idx,
                 phase_ends_at = now() + (coalesce(v_q.time_limit_sec, 20) * interval '1 second')
           where room_id = v_room;
        end if;
      else
        update ks_boards
           set phase = 'ended', ended_at = now(), phase_ends_at = null
         where room_id = v_room;
      end if;

    when v_b.phase = 'ended' then
      -- Zurück in die Lobby. Die Punkte bleiben stehen, bis die
      -- nächste Runde startet — wer die Siegerehrung verlässt, will
      -- oft nur noch einmal nachsehen.
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

comment on function ks_step(text, text) is
  'Schaltet den Ablauf eines Raums weiter. p_from ist die Phase, aus der '
  'geklickt wurde — passt sie nicht, verpufft der Klick (stale).';

-- Die alte Hülle bleibt. Ihre Signatur wird NICHT erweitert: ein
-- zweites ks_advance(text, …) machte den Aufruf mit einem Argument
-- mehrdeutig, und PostgREST könnte ihn dann nicht mehr binden.
create or replace function ks_advance(p_code text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  return ks_step(p_code, null);
end;
$$;

revoke all on function ks_advance(text) from public;
grant execute on function ks_advance(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Katalog wählen — jetzt mit Rückmeldung
-- ─────────────────────────────────────────────────────────────
-- Bisher gab die Funktion nur `ok` zurück; die Lobby konnte nicht
-- sagen, wie viele Fragen der gewählte Katalog hat, ohne ein zweites
-- Mal zu fragen.
create or replace function ks_room_setup(
  p_code     text,
  p_catalog  uuid default null,
  p_settings jsonb default null
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room  uuid := ks_owned_room(p_code);
  v_b     ks_boards;
  v_count int;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_b := ks_ensure_board(v_room);

  if v_b.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  if p_catalog is not null then
    -- Nur Kataloge, die diese Lehrkraft auch sehen darf.
    if not exists (select 1 from ks_catalogs c
                    where c.id = p_catalog
                      and (c.is_template or c.owner_id = auth.uid())) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    select count(*) into v_count from ks_questions where catalog_id = p_catalog;

    update ks_boards
       set catalog_id     = p_catalog,
           question_count = v_count,
           current_q_idx  = 0,
           settings       = coalesce(p_settings, settings)
     where room_id = v_room;
  elsif p_settings is not null then
    update ks_boards set settings = p_settings where room_id = v_room;
    select question_count into v_count from ks_boards where room_id = v_room;
  else
    select question_count into v_count from ks_boards where room_id = v_room;
  end if;

  return jsonb_build_object('ok', true, 'question_count', coalesce(v_count, 0));
end;
$$;

revoke all on function ks_room_setup(text, uuid, jsonb) from public;
grant execute on function ks_room_setup(text, uuid, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Signaturen
-- ─────────────────────────────────────────────────────────────
-- Eine Signatur ist ein Versprechen: ändert sie sich nicht, muss
-- nichts neu gezeichnet werden. Bisher hielt sie das nicht — Punkte,
-- Emotes und Wesenwahl standen nicht darin. In der Lobby hieß das:
-- ein Kind wechselt sein Wesen, und am Beamer bleibt das alte stehen,
-- bis irgendwer beitritt.
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
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_b := ks_ensure_board(v_room);

  select count(*) into v_ans from ks_answers
   where room_id = v_room and question_idx = v_b.current_q_idx;

  -- Vier Zahlen aus einem Durchlauf: Anzahl, Punktsumme, eine
  -- Prüfzahl über Wesen/Skin/Namenslänge und der jüngste Emote.
  -- Die Prüfzahl ist keine Kunst, sondern billig — sie soll nur
  -- anders sein, wenn jemand sein Wesen wechselt.
  select count(*),
         coalesce(sum(score), 0),
         coalesce(sum(creature_id * 7 + skin_idx * 3 + length(coalesce(nickname, ''))), 0),
         coalesce(max(extract(epoch from last_emote_at))::bigint, 0)
    into v_n, v_sum, v_look, v_emo
    from ks_players where room_id = v_room;

  return jsonb_build_object(
    'ok',  true,
    'sig', concat_ws(':',
             v_b.phase, v_b.current_q_idx, v_b.question_count,
             coalesce(v_b.catalog_id::text, '-'),
             v_ans, v_n, v_sum, v_look, v_emo,
             coalesce(extract(epoch from v_b.phase_ends_at)::bigint, 0))
  );
end;
$$;

revoke all on function ks_room_sig(text) from public;
grant execute on function ks_room_sig(text) to authenticated;

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

  -- Punktsumme UND Anzahl des ganzen Raums: daran hängt der eigene
  -- Rang und wer links und rechts von mir steht. Ohne das stünde in
  -- der Auflösung ein Nachbar, der längst überholt wurde.
  select count(*), coalesce(sum(score), 0),
         coalesce(max(extract(epoch from last_emote_at))::bigint, 0)
    into v_n, v_sum, v_emo
    from ks_players where room_id = v_p.room_id;

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


-- ─────────────────────────────────────────────────────────────
-- 6) Der Beamer
-- ─────────────────────────────────────────────────────────────
-- Neu gegenüber 0174:
--   · leaderboard in der Reihenfolge 1…5 mit `delta` (was DIESE
--     Frage gebracht hat) und `correct`
--   · players mit rank, score, correct und einem FLÜCHTIGEN emote
--   · catalogs + catalog_title, damit die Lobby ihren Katalog ohne
--     zweiten Aufruf anbieten kann
--   · answers_total, damit die Füllstände nicht clientseitig
--     zusammengezählt werden müssen
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

  -- Die Katalogliste nur in der Lobby: dort wird sie gebraucht,
  -- danach wäre sie in jedem Takt unnötiges Gewicht.
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
           -- Flüchtig: nach 3,5 Sekunden ist ein Emote vorbei. Ohne
           -- diese Grenze klebte am Beamer ewig dasselbe Zeichen.
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
                        'text',        v_q.question_text,
                        'options',     v_q.options,
                        'correct_idx', case when v_reveal then v_q.correct_idx else null end,
                        'explanation', case when v_reveal then v_q.explanation else null end,
                        'time_limit',  v_q.time_limit_sec
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
-- 7) Das Schülergerät
-- ─────────────────────────────────────────────────────────────
-- Der Fragetext geht in der Frage-Phase NICHT mehr mit. Das ist eine
-- Absprache über das Spiel und keine Sparsamkeit: die Frage steht am
-- Beamer, damit die Klasse gemeinsam hinsieht. Stünde sie auch auf
-- dem Tablet, sähen 28 Köpfe nach unten.
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

  -- Rang und Nachbarn in EINEM Durchlauf. In 0174 standen dafür drei
  -- Fensterabfragen über derselben Tabelle da; dieselbe Auskunft aus
  -- einer Quelle kann nicht auseinanderlaufen.
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
                   -- Der Text erst zur Auflösung, die Optionen immer:
                   -- auf den Kacheln stehen die Antworten.
                   'text',        case when v_reveal then v_q.question_text else null end,
                   'options',     v_q.options,
                   'time_limit',  v_q.time_limit_sec,
                   'correct_idx', case when v_reveal then v_q.correct_idx else null end,
                   'explanation', case when v_reveal then v_q.explanation else null end
                 ) else null end,
    'neighbor_before', v_prev,
    'neighbor_after',  v_next
  );
end;
$$;

revoke all on function ks_view(text) from public;
grant execute on function ks_view(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) Emote
-- ─────────────────────────────────────────────────────────────
-- Mit Liste statt `left(p_emote, 20)`: die Zeichenklassen in
-- creatures.css heißen genau so, und ein Wort, das es dort nicht
-- gibt, ergäbe am Beamer ein Wesen, das gar nichts tut.
create or replace function ks_emote(p_token text, p_emote text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p skill_participants;
  v_e text := lower(btrim(coalesce(p_emote, '')));
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;
  if v_p.blocked then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;

  if v_e not in ('wave', 'cheer', 'dance', 'sleep', 'sad', 'jump') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  perform ks_ensure_player(v_p.id, v_p.room_id);

  update ks_players
     set last_emote    = v_e,
         last_emote_at = now()
   where participant_id = v_p.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_emote(text, text) from public;
grant execute on function ks_emote(text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 9) Beitreten / Wesen wählen
-- ─────────────────────────────────────────────────────────────
-- Neu: ein gesperrtes Tablet kommt nicht durch, und das Wesen darf
-- während einer laufenden Frage nicht mehr gewechselt werden — sonst
-- steht in der Auflösung ein anderes Wesen auf dem Podest als das,
-- das geantwortet hat.
create or replace function ks_join(
  p_token    text,
  p_nickname text     default null,
  p_creature smallint default 0,
  p_skin     smallint default 0
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p  skill_participants;
  v_b  ks_boards;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;
  if v_p.blocked then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;

  v_b := ks_ensure_board(v_p.room_id);
  perform ks_ensure_player(v_p.id, v_p.room_id);

  if v_b.phase = 'question' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  update ks_players
     set nickname    = coalesce(nullif(btrim(p_nickname), ''), nickname, v_p.name, 'Gast'),
         creature_id = least(greatest(coalesce(p_creature, 0::smallint), 0::smallint), 35::smallint),
         skin_idx    = least(greatest(coalesce(p_skin, 0::smallint), 0::smallint), 2::smallint)
   where participant_id = v_p.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_join(text, text, smallint, smallint) from public;
grant execute on function ks_join(text, text, smallint, smallint) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 10) Antworten
-- ─────────────────────────────────────────────────────────────
-- Zwei Änderungen:
--
--  a) Die Zeit wird SERVERSEITIG gerechnet. p_response_ms kommt vom
--     Gerät und ist damit eine Angabe der Gegenseite — wer sie
--     bearbeitet, bekommt den Geschwindigkeitsbonus geschenkt.
--     Gerechnet wird aus phase_ends_at, das der Server selbst
--     gesetzt hat. Das Argument bleibt in der Signatur (sonst wäre
--     der Aufruf mehrdeutig) und wird nur noch protokolliert.
--
--  b) Kein Emote mehr. 'cheer'/'sad' hier zu setzen löschte das
--     Winken des Kindes und klebte am Beamer fest; richtig/falsch
--     weiß die Anzeige aus der Antwort selbst.
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

  -- Ein Riegel je Raum. 28 Kinder tippen im selben Augenblick, und
  -- ohne ihn liefen zwei Antworten desselben Kindes aneinander
  -- vorbei (Doppelklick, zweites Fenster).
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

  -- Verbrauchte Zeit aus der Serveruhr: Start = Ende minus Zeitlimit.
  v_ms := greatest(0, least(v_limit * 1000,
            (extract(epoch from (now() - (v_b.phase_ends_at - v_limit * interval '1 second')))
             * 1000)::int));

  v_correct := (p_chosen = v_q.correct_idx);

  if v_correct then
    v_streak := v_pl.streak + 1;
    -- Je schneller, desto mehr — bis zu 1000 zusätzlich.
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
