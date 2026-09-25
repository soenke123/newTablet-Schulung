-- ══════════════════════════════════════════════════════════════
-- Migration 0174 — Knowledge Stack: Klassen-Quiz mit 36 Wesen
-- ══════════════════════════════════════════════════════════════
-- Ein synchronisiertes Klassen-Quiz für MPSkills:
--
--   • Fragenkataloge unabhängig vom Raum (ks_catalogs, ks_questions)
--   • 12 Seed-Fragen aus dem Handout der Tablet-Schulung
--   • Spielzustand pro Raum (ks_boards) mit Phasen:
--       lobby → question → reveal → podium → ended
--   • Teilnehmer (ks_players) mit Wesen-ID (0..35), Skin (0..2),
--     Score, Streak, Emotes
--   • Atomare Antworten (ks_answers) mit Geschwindigkeitsbonus &
--     Advisory Lock gegen Race Conditions bei 28 gleichzeitigen Klicks
--   • Top-5-Leaderboard für den Beamer + Nachbar-Anzeige fürs Tablet
--   • Billige Signatur (ks_sig / ks_room_sig) zur Polling-Entlastung
--   • Registrierung in skill_tools (id: 'knowledgestack', folder: 'KnowledgeStack')
--
-- Kein DROP — Idempotenz per `create table if not exists`,
-- `create or replace function`, `on conflict do update`.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Registrierung in skill_tools
-- ─────────────────────────────────────────────────────────────
insert into skill_tools (id, title, blurb, icon, folder, subject,
                         multi_room, limits, active, sort_order) values
  ('knowledgestack', 'Knowledge Stack',
   'Live-Quiz für die ganze Klasse: Fragen am Beamer, Antworten auf dem Tablet — '
   'wer schnell und richtig liegt, klettert im Leaderboard.',
   '🧠', 'KnowledgeStack', 'Fächerübergreifend', false,
   '{}'::jsonb, true, 70)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  subject    = excluded.subject,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  sort_order = excluded.sort_order;


-- ─────────────────────────────────────────────────────────────
-- 2) Tabellen: Fragenkataloge & Fragen
-- ─────────────────────────────────────────────────────────────
create table if not exists ks_catalogs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete set null,
  school_id   uuid,
  title       text not null,
  subject     text not null default 'Allgemein',
  is_template boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table ks_catalogs is
  'Fragenkataloge für Knowledge Stack. Existieren unabhängig vom Raum, '
  'damit Lehrkräfte sie in mehreren Klassen wiederverwenden können.';

alter table ks_catalogs enable row level security;
grant select, insert, update, delete on ks_catalogs to authenticated;
grant select on ks_catalogs to anon;

create table if not exists ks_questions (
  id             uuid primary key default gen_random_uuid(),
  catalog_id     uuid not null references ks_catalogs(id) on delete cascade,
  question_text  text not null,
  options        jsonb not null,  -- Array von 2..4 Antwort-Strings
  correct_idx    smallint not null check (correct_idx between 0 and 3),
  time_limit_sec int not null default 20 check (time_limit_sec between 5 and 120),
  explanation    text,
  sort_order     int not null default 0
);

comment on table ks_questions is
  'Einzelfragen eines Katalogs mit Optionen (2..4), korrekter Antwort und Zeitlimit.';

alter table ks_questions enable row level security;
grant select, insert, update, delete on ks_questions to authenticated;
grant select on ks_questions to anon;


-- ─────────────────────────────────────────────────────────────
-- 3) Tabellen: Spielzustand, Spieler & Antworten
-- ─────────────────────────────────────────────────────────────
create table if not exists ks_boards (
  room_id           uuid primary key references skill_rooms(id) on delete cascade,
  catalog_id        uuid references ks_catalogs(id) on delete set null,
  phase             text not null default 'lobby'
                      check (phase in ('lobby', 'question', 'reveal', 'podium', 'ended')),
  current_q_idx     int not null default 0,
  phase_ends_at     timestamptz,
  question_count    int not null default 0,
  settings          jsonb not null default '{}'::jsonb,
  started_at        timestamptz,
  ended_at          timestamptz,
  presenter_seen_at timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

comment on table ks_boards is
  'Der Spielzustand eines KnowledgeStack-Raums (ein Board pro Raum).';

alter table ks_boards enable row level security;
grant select, insert, update, delete on ks_boards to service_role;

create table if not exists ks_players (
  participant_id  uuid primary key references skill_participants(id) on delete cascade,
  room_id         uuid not null references skill_rooms(id) on delete cascade,
  creature_id     smallint not null default 0 check (creature_id between 0 and 35),
  skin_idx        smallint not null default 0 check (skin_idx between 0 and 2),
  nickname        text not null default '',
  score           int not null default 0,
  prev_score      int not null default 0, -- Punktestand vor der letzten Frage (für Rang-Delta)
  streak          int not null default 0,
  last_emote      text,
  last_emote_at   timestamptz,
  joined_at       timestamptz not null default now()
);

comment on table ks_players is
  'Teilnehmer eines KnowledgeStack-Quiz mit Wesen, Skin, Score und Streak.';

alter table ks_players enable row level security;
grant select, insert, update, delete on ks_players to service_role;

create table if not exists ks_answers (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references skill_rooms(id) on delete cascade,
  question_idx    int not null,
  participant_id  uuid not null references skill_participants(id) on delete cascade,
  chosen_idx      smallint not null check (chosen_idx between 0 and 3),
  is_correct      boolean not null,
  response_ms     int not null default 0,
  points_awarded  int not null default 0,
  answered_at     timestamptz not null default now(),
  unique (room_id, question_idx, participant_id)
);

comment on table ks_answers is
  'Pro Frage eingereichte Antwort jedes Teilnehmers. UNIQUE verhindert Doppelantworten.';

alter table ks_answers enable row level security;
grant select, insert, update, delete on ks_answers to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) Interne Helfer
-- ─────────────────────────────────────────────────────────────
create or replace function ks_owned_room(p_code text)
  returns uuid
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
begin
  if v_user is null then return null; end if;
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then return null; end if;
  return v_room.id;
end;
$$;

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
    -- Standard-Katalog (Tablet-Schulung Template) als Fallback
    select id into v_default_catalog from ks_catalogs
     where is_template = true
     order by created_at asc limit 1;

    insert into ks_boards (room_id, catalog_id, question_count)
    values (
      p_room,
      v_default_catalog,
      coalesce((select count(*) from ks_questions where catalog_id = v_default_catalog), 0)
    )
    returning * into v_b;
  end if;
  return v_b;
end;
$$;

create or replace function ks_ensure_player(p_participant uuid, p_room uuid)
  returns ks_players
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_pl ks_players;
begin
  select * into v_pl from ks_players where participant_id = p_participant;
  if v_pl.participant_id is null then
    insert into ks_players (participant_id, room_id)
    values (p_participant, p_room)
    returning * into v_pl;
  end if;
  return v_pl;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 5) Pult-Funktionen (Lehrkraft / Beamer)
-- ─────────────────────────────────────────────────────────────

-- Kataloge auflisten (Vorlagen + eigene)
create or replace function ks_catalogs_list()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
begin
  return jsonb_build_object(
    'ok', true,
    'catalogs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          c.id,
        'title',       c.title,
        'subject',     c.subject,
        'is_template', c.is_template,
        'mine',        (c.owner_id = v_user),
        'count',       (select count(*) from ks_questions q where q.catalog_id = c.id)
      ) order by c.is_template desc, c.created_at asc)
      from ks_catalogs c
      where c.is_template = true or (v_user is not null and c.owner_id = v_user)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function ks_catalogs_list() from public;
grant execute on function ks_catalogs_list() to authenticated, anon;

-- Setup in der Lobby (Katalog wählen, Settings)
create or replace function ks_room_setup(
  p_code     text,
  p_catalog  uuid default null,
  p_settings jsonb default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := ks_owned_room(p_code);
  v_b    ks_boards;
  v_count int;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_b := ks_ensure_board(v_room);

  if v_b.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  if p_catalog is not null then
    select count(*) into v_count from ks_questions where catalog_id = p_catalog;
    update ks_boards
       set catalog_id     = p_catalog,
           question_count = v_count,
           settings       = coalesce(p_settings, settings)
     where room_id = v_room;
  elsif p_settings is not null then
    update ks_boards
       set settings = coalesce(p_settings, settings)
     where room_id = v_room;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_room_setup(text, uuid, jsonb) from public;
grant execute on function ks_room_setup(text, uuid, jsonb) to authenticated;

-- Spielschritte weiterschalten (Lobby → Question → Reveal → Podium → ...)
create or replace function ks_advance(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room  uuid := ks_owned_room(p_code);
  v_b     ks_boards;
  v_q     ks_questions;
  v_next_idx int;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_b := ks_ensure_board(v_room);

  case v_b.phase
    when 'lobby' then
      -- Start bei Frage 0
      select * into v_q from ks_questions
       where catalog_id = v_b.catalog_id
       order by sort_order, id limit 1;

      if v_q.id is null then
        return jsonb_build_object('ok', false, 'error', 'no_questions');
      end if;

      -- Vor Beginn: Punktestände auf 0 setzen
      update ks_players set score = 0, prev_score = 0, streak = 0 where room_id = v_room;
      delete from ks_answers where room_id = v_room;

      update ks_boards
         set phase         = 'question',
             current_q_idx = 0,
             phase_ends_at = now() + (v_q.time_limit_sec * interval '1 second'),
             started_at    = now()
       where room_id = v_room;

    when 'question' then
      -- Von Frage zu Reveal (Auflösung)
      update ks_boards
         set phase         = 'reveal',
             phase_ends_at = null
       where room_id = v_room;

    when 'reveal' then
      -- Von Reveal zu Podium (Zwischenstand/Leaderboard)
      -- prev_score für das nächste Rang-Delta aktualisieren
      update ks_players set prev_score = score where room_id = v_room;

      update ks_boards
         set phase         = 'podium',
             phase_ends_at = null
       where room_id = v_room;

    when 'podium' then
      -- Nächste Frage oder Spielende
      v_next_idx := v_b.current_q_idx + 1;
      if v_next_idx < v_b.question_count then
        -- Nächste Frage holen
        select * into v_q from ks_questions
         where catalog_id = v_b.catalog_id
         order by sort_order, id offset v_next_idx limit 1;

        update ks_boards
           set phase         = 'question',
               current_q_idx = v_next_idx,
               phase_ends_at = now() + (coalesce(v_q.time_limit_sec, 20) * interval '1 second')
         where room_id = v_room;
      else
        -- Alle Fragen durch → Ended
        update ks_boards
           set phase    = 'ended',
               ended_at = now(),
               phase_ends_at = null
         where room_id = v_room;
      end if;

    when 'ended' then
      -- Zurück zur Lobby für neue Runde
      update ks_boards
         set phase         = 'lobby',
             current_q_idx = 0,
             phase_ends_at = null,
             started_at    = null,
             ended_at      = null
       where room_id = v_room;
  end case;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_advance(text) from public;
grant execute on function ks_advance(text) to authenticated;

-- Billige Pult-Signatur
create or replace function ks_room_sig(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := ks_owned_room(p_code);
  v_b    ks_boards;
  v_ans_count int;
  v_player_count int;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_b := ks_ensure_board(v_room);

  select count(*) into v_ans_count from ks_answers
   where room_id = v_room and question_idx = v_b.current_q_idx;

  select count(*) into v_player_count from ks_players
   where room_id = v_room;

  return jsonb_build_object(
    'ok',  true,
    'sig', v_b.phase || ':' || v_b.current_q_idx || ':' || v_ans_count || ':' || v_player_count || ':' ||
           coalesce(extract(epoch from v_b.phase_ends_at)::int, 0)
  );
end;
$$;

revoke all on function ks_room_sig(text) from public;
grant execute on function ks_room_sig(text) to authenticated;

-- Voller Pult-State für Beamer
create or replace function ks_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   uuid := ks_owned_room(p_code);
  v_b      ks_boards;
  v_q      ks_questions;
  v_ans    jsonb;
  v_top5   jsonb;
  v_players jsonb;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_b := ks_ensure_board(v_room);

  -- Aktuelle Frage
  if v_b.phase <> 'lobby' then
    select * into v_q from ks_questions
     where catalog_id = v_b.catalog_id
     order by sort_order, id offset v_b.current_q_idx limit 1;
  end if;

  -- Antwortverteilung für die aktuelle Frage
  select coalesce(jsonb_object_agg(chosen_idx, cnt), '{}'::jsonb)
    into v_ans
    from (
      select chosen_idx, count(*)::int as cnt
        from ks_answers
       where room_id = v_room and question_idx = v_b.current_q_idx
       group by chosen_idx
    ) a;

  -- Top-5-Leaderboard mit Rank-Delta
  with ranked as (
    select participant_id, creature_id, skin_idx, nickname, score, prev_score,
           dense_rank() over (order by score desc, participant_id) as curr_rank,
           dense_rank() over (order by prev_score desc, participant_id) as old_rank
      from ks_players
     where room_id = v_room
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'participant_id', participant_id,
           'creature_id',    creature_id,
           'skin_idx',       skin_idx,
           'nickname',       nickname,
           'score',          score,
           'rank',           curr_rank,
           'rank_change',    (old_rank - curr_rank)
         ) order by curr_rank asc), '[]'::jsonb)
    into v_top5
    from ranked
   where curr_rank <= 5;

  -- Alle Spieler für Lobby-Ansicht (Wesen, Emotes)
  select coalesce(jsonb_agg(jsonb_build_object(
           'participant_id', p.participant_id,
           'seat',           sp.seat,
           'creature_id',    p.creature_id,
           'skin_idx',       p.skin_idx,
           'nickname',       coalesce(nullif(p.nickname, ''), sp.name, 'Gast'),
           'score',          p.score,
           'last_emote',     p.last_emote,
           'answered',       exists(select 1 from ks_answers a
                                     where a.room_id = v_room
                                       and a.question_idx = v_b.current_q_idx
                                       and a.participant_id = p.participant_id)
         ) order by sp.seat), '[]'::jsonb)
    into v_players
    from ks_players p
    join skill_participants sp on sp.id = p.participant_id
   where p.room_id = v_room;

  return jsonb_build_object(
    'ok',             true,
    'role',           'presenter',
    'phase',          v_b.phase,
    'current_q_idx',  v_b.current_q_idx,
    'question_count', v_b.question_count,
    'phase_ends_at',  v_b.phase_ends_at,
    'question',       case when v_q.id is not null then jsonb_build_object(
                        'text',        v_q.question_text,
                        'options',     v_q.options,
                        'correct_idx', case when v_b.phase in ('reveal', 'podium', 'ended')
                                            then v_q.correct_idx else null end,
                        'explanation', case when v_b.phase in ('reveal', 'podium', 'ended')
                                            then v_q.explanation else null end,
                        'time_limit',  v_q.time_limit_sec
                      ) else null end,
    'answers_dist',   v_ans,
    'leaderboard',    v_top5,
    'players',        v_players
  );
end;
$$;

revoke all on function ks_room_get(text) from public;
grant execute on function ks_room_get(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) Participant-Funktionen (Schüler-Tablet / Handy)
-- ─────────────────────────────────────────────────────────────

-- Profil (Wesen, Skin, Nickname) wählen
create or replace function ks_join(
  p_token    text,
  p_nickname text     default null,
  p_creature smallint default 0,
  p_skin     smallint default 0
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p  skill_participants;
  v_pl ks_players;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;

  v_pl := ks_ensure_player(v_p.id, v_p.room_id);

  update ks_players
     set nickname    = coalesce(nullif(btrim(p_nickname), ''), nickname, v_p.name, 'Gast'),
         creature_id = least(greatest(p_creature, 0::smallint), 35::smallint),
         skin_idx    = least(greatest(p_skin, 0::smallint), 2::smallint)
   where participant_id = v_p.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_join(text, text, smallint, smallint) from public;
grant execute on function ks_join(text, text, smallint, smallint) to anon, authenticated;

-- Emote senden (Lobby / Podium)
create or replace function ks_emote(p_token text, p_emote text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p skill_participants;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;

  update ks_players
     set last_emote    = left(p_emote, 20),
         last_emote_at = now()
   where participant_id = v_p.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_emote(text, text) from public;
grant execute on function ks_emote(text, text) to anon, authenticated;

-- Billige Participant-Signatur
create or replace function ks_sig(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p skill_participants;
  v_b ks_boards;
  v_has_answered boolean;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;
  v_b := ks_ensure_board(v_p.room_id);

  select exists(select 1 from ks_answers
                 where room_id = v_p.room_id
                   and question_idx = v_b.current_q_idx
                   and participant_id = v_p.id)
    into v_has_answered;

  return jsonb_build_object(
    'ok',  true,
    'sig', v_b.phase || ':' || v_b.current_q_idx || ':' ||
           (case when v_has_answered then '1' else '0' end) || ':' ||
           coalesce(extract(epoch from v_b.phase_ends_at)::int, 0)
  );
end;
$$;

revoke all on function ks_sig(text) from public;
grant execute on function ks_sig(text) to anon, authenticated;

-- Voller State für Teilnehmer (mit Nachbarn im Ranking)
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
  v_my_rank int;
  v_old_rank int;
  v_prev_p jsonb;
  v_next_p jsonb;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;

  v_b  := ks_ensure_board(v_p.room_id);
  v_pl := ks_ensure_player(v_p.id, v_p.room_id);

  -- Eigene Antwort zur aktuellen Frage (falls vorhanden)
  select * into v_my_ans from ks_answers
   where room_id = v_p.room_id
     and question_idx = v_b.current_q_idx
     and participant_id = v_p.id;

  -- Aktuelle Frage (Optionen, aber OHNE correct_idx während Frage-Phase!)
  if v_b.phase <> 'lobby' then
    select * into v_q from ks_questions
     where catalog_id = v_b.catalog_id
     order by sort_order, id offset v_b.current_q_idx limit 1;
  end if;

  -- Eigenes Ranking + Vorgänger & Nachfolger berechnen
  with ranked as (
    select participant_id, creature_id, skin_idx, nickname, score, prev_score,
           dense_rank() over (order by score desc, participant_id) as curr_rank,
           dense_rank() over (order by prev_score desc, participant_id) as o_rank
      from ks_players
     where room_id = v_p.room_id
  )
  select curr_rank, o_rank into v_my_rank, v_old_rank
    from ranked where participant_id = v_p.id;

  -- Vorgänger (Rang - 1)
  select jsonb_build_object('creature_id', creature_id, 'skin_idx', skin_idx,
                            'nickname', nickname, 'score', score, 'rank', curr_rank)
    into v_prev_p
    from (
      select * from (
        select participant_id, creature_id, skin_idx, nickname, score,
               dense_rank() over (order by score desc, participant_id) as curr_rank
          from ks_players where room_id = v_p.room_id
      ) r where r.curr_rank < coalesce(v_my_rank, 9999)
      order by r.curr_rank desc limit 1
    ) p1;

  -- Nachfolger (Rang + 1)
  select jsonb_build_object('creature_id', creature_id, 'skin_idx', skin_idx,
                            'nickname', nickname, 'score', score, 'rank', curr_rank)
    into v_next_p
    from (
      select * from (
        select participant_id, creature_id, skin_idx, nickname, score,
               dense_rank() over (order by score desc, participant_id) as curr_rank
          from ks_players where room_id = v_p.room_id
      ) r where r.curr_rank > coalesce(v_my_rank, 0)
      order by r.curr_rank asc limit 1
    ) p2;

  return jsonb_build_object(
    'ok',             true,
    'role',           'participant',
    'phase',          v_b.phase,
    'current_q_idx',  v_b.current_q_idx,
    'question_count', v_b.question_count,
    'phase_ends_at',  v_b.phase_ends_at,
    'me', jsonb_build_object(
            'participant_id', v_p.id,
            'seat',           v_p.seat,
            'nickname',       coalesce(nullif(v_pl.nickname, ''), v_p.name, 'Gast'),
            'creature_id',    v_pl.creature_id,
            'skin_idx',       v_pl.skin_idx,
            'score',          v_pl.score,
            'streak',         v_pl.streak,
            'rank',           coalesce(v_my_rank, 1),
            'rank_change',    coalesce(v_old_rank - v_my_rank, 0),
            'last_emote',     v_pl.last_emote
          ),
    'my_answer', case when v_my_ans.id is not null then jsonb_build_object(
                   'chosen_idx',     v_my_ans.chosen_idx,
                   'is_correct',     v_my_ans.is_correct,
                   'points_awarded', v_my_ans.points_awarded
                 ) else null end,
    'question',  case when v_q.id is not null then jsonb_build_object(
                   'text',        v_q.question_text,
                   'options',     v_q.options,
                   'time_limit',  v_q.time_limit_sec,
                   'correct_idx', case when v_b.phase in ('reveal', 'podium', 'ended')
                                       then v_q.correct_idx else null end
                 ) else null end,
    'neighbor_before', v_prev_p,
    'neighbor_after',  v_next_p
  );
end;
$$;

revoke all on function ks_view(text) from public;
grant execute on function ks_view(text) to anon, authenticated;

-- Antwort abgeben (atomar mit Advisory Lock)
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
  v_base    int := 1000;
  v_bonus   int := 0;
  v_streak  int;
  v_mul     numeric := 1.0;
  v_points  int := 0;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;

  -- 1) Advisory Lock auf Raum-ID: verhindert parallele Klicks & Race Conditions
  perform pg_advisory_xact_lock(hashtext(v_p.room_id::text));

  v_b := ks_ensure_board(v_p.room_id);
  if v_b.phase <> 'question' or v_b.current_q_idx <> p_question_idx then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  if v_b.phase_ends_at is not null and now() > v_b.phase_ends_at + interval '1 second' then
    return jsonb_build_object('ok', false, 'error', 'time_up');
  end if;

  -- Prüfen ob bereits geantwortet
  if exists (select 1 from ks_answers where room_id = v_p.room_id
               and question_idx = p_question_idx
               and participant_id = v_p.id) then
    return jsonb_build_object('ok', false, 'error', 'already_answered');
  end if;

  v_pl := ks_ensure_player(v_p.id, v_p.room_id);

  -- Frage laden
  select * into v_q from ks_questions
   where catalog_id = v_b.catalog_id
   order by sort_order, id offset p_question_idx limit 1;

  if v_q.id is null then return jsonb_build_object('ok', false, 'error', 'question_not_found'); end if;

  v_correct := (p_chosen = v_q.correct_idx);

  if v_correct then
    v_streak := v_pl.streak + 1;
    -- Zeitbonus: je schneller, desto mehr Extra-Punkte bis 1000
    v_bonus  := greatest(0, round(1000 * (1 - least(p_response_ms, v_q.time_limit_sec * 1000)::numeric /
                                               (v_q.time_limit_sec * 1000))));
    v_mul    := 1.0 + (least(v_streak, 5) * 0.1);
    v_points := round((v_base + v_bonus) * v_mul);
  else
    v_streak := 0;
    v_points := 0;
  end if;

  -- Antwort speichern
  insert into ks_answers (room_id, question_idx, participant_id, chosen_idx,
                          is_correct, response_ms, points_awarded)
  values (v_p.room_id, p_question_idx, v_p.id, p_chosen,
          v_correct, p_response_ms, v_points);

  -- Spieler aktualisieren
  update ks_players
     set score      = score + v_points,
         streak     = v_streak,
         last_emote = case when v_correct then 'cheer' else 'sad' end,
         last_emote_at = now()
   where participant_id = v_p.id;

  return jsonb_build_object(
    'ok',            true,
    'is_correct',    v_correct,
    'points_earned', v_points,
    'streak',        v_streak
  );
end;
$$;

revoke all on function ks_answer(text, int, smallint, int) from public;
grant execute on function ks_answer(text, int, smallint, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Seed-Katalog: 12 Fragen aus dem Tablet-Schulung Handout
-- ─────────────────────────────────────────────────────────────
insert into ks_catalogs (id, title, subject, is_template) values
  ('00000000-0000-4000-8000-000000000074',
   'Tablet-Schulung: Grundlagen', 'Tablet-Schulung', true)
on conflict (id) do update set
  title       = excluded.title,
  subject     = excluded.subject,
  is_template = excluded.is_template;

delete from ks_questions where catalog_id = '00000000-0000-4000-8000-000000000074';

insert into ks_questions (catalog_id, question_text, options, correct_idx,
                          time_limit_sec, explanation, sort_order) values
-- 1) Grundprinzip
('00000000-0000-4000-8000-000000000074',
 'Was ist das Tablet laut der Schulung?',
 '["Ein Freizeitgerät", "Ein Arbeitsgerät", "Ein Spielgerät", "Ein Ersatz für Papier"]'::jsonb,
 1, 15,
 'Das Tablet ist ein Arbeitsgerät – kein Freizeitgerät. (Kapitel 1)', 1),

-- 2) Hausregeln
('00000000-0000-4000-8000-000000000074',
 'Was muss während des Unterrichts IMMER aktiviert sein?',
 '["Bluetooth", "Der Fokus-Modus", "AirDrop", "WLAN-Hotspot"]'::jsonb,
 1, 15,
 'Der Fokus-Modus ist Pflicht und immer aktiviert. (Hausregel 4)', 2),

-- 3) Hausregeln
('00000000-0000-4000-8000-000000000074',
 'Was ist während des Unterrichts NICHT erlaubt?',
 '["IServ nutzen", "Splitscreen und App-Wechsel", "GoodNotes öffnen", "Mit dem Stift schreiben"]'::jsonb,
 1, 15,
 'Kein Splitscreen und kein App-Wechsel während des Unterrichts. (Hausregel 6)', 3),

-- 4) Dateiformate
('00000000-0000-4000-8000-000000000074',
 'In welchem Format werden Abgaben standardmäßig eingereicht?',
 '["Word (.docx)", "PowerPoint (.pptx)", "PDF (.pdf)", "JPEG (.jpg)"]'::jsonb,
 2, 15,
 'PDF ist die Lingua franca für Abgaben: Das Layout bleibt auf jedem Gerät identisch. (Kapitel 4)', 4),

-- 5) Dateiname
('00000000-0000-4000-8000-000000000074',
 'Wie lautet das Standard-Namensformat für Abgaben?',
 '["Aufgabe_Klasse.pdf", "Nachname_Vorname_Klasse_Fach_Aufgabe.pdf", "Abgabe_2024.pdf", "Dokument1.pdf"]'::jsonb,
 1, 20,
 'Nachname_Vorname_Klasse_Fach_Aufgabe.pdf – erleichtert Lehrkräften die Zuordnung. (Kapitel 4)', 5),

-- 6) Ordnerstruktur
('00000000-0000-4000-8000-000000000074',
 'Wonach sollte man seine Ordnerstruktur auf dem iPad sortieren?',
 '["Nach Schuljahren", "Nach Datum", "Nach Fächern als Hauptordner", "Gar nicht – alles auf den Desktop"]'::jsonb,
 2, 15,
 'Fächer als Hauptordner, Themen als Unterordner. Nicht nach Schuljahren – Themen kehren wieder. (Kapitel 5)', 6),

-- 7) Dateisicherheit
('00000000-0000-4000-8000-000000000074',
 'An wie vielen Orten sollten wichtige Dateien mindestens gespeichert sein?',
 '["An einem Ort reicht", "An mindestens zwei Orten", "An mindestens fünf Orten", "Nur in der Cloud"]'::jsonb,
 1, 15,
 'Lokal auf dem iPad UND in der Cloud (iCloud oder IServ). Wer nur lokal speichert, riskiert Datenverlust. (Kapitel 6)', 7),

-- 8) Aufmerksamkeit
('00000000-0000-4000-8000-000000000074',
 'Wie viele Minuten verbringen Jugendliche laut JIM-Studie täglich am Smartphone?',
 '["87 Minuten", "145 Minuten", "231 Minuten", "312 Minuten"]'::jsonb,
 2, 20,
 '231 Minuten – knapp 4 Stunden. Das sind rund 24 % des Wachtags. (Kapitel 7, JIM-Studie 2025)', 8),

-- 9) Ablenkung
('00000000-0000-4000-8000-000000000074',
 'Welcher Trick macht bunte Apps weniger attraktiv und hilft gegen Ablenkung?',
 '["Lautstärke aus", "Graustufen-Modus", "Helligkeit runter", "Dark Mode"]'::jsonb,
 1, 15,
 'Der Graustufen-Modus macht Apps unattraktiver – einfach, kostenlos und überraschend wirksam. (Kapitel 8)', 9),

-- 10) Fokus-Modus
('00000000-0000-4000-8000-000000000074',
 'Welches Fokus-Profil eignet sich speziell für Unterrichtszeiten?',
 '["Schlafen", "Schule", "Gaming", "Fitness"]'::jsonb,
 1, 15,
 'Das Profil „Schule" erlaubt nur Lern-Apps und blockiert alle sozialen Medien. (Kapitel 9)', 10),

-- 11) Digitales Schreiben
('00000000-0000-4000-8000-000000000074',
 'Welche Methode hat laut Studien den HÖCHSTEN Lerneffekt für Mitschriften?',
 '["Tastatur tippen", "Handschrift (Papier oder Stift)", "Fotos vom Tafelbild", "Audio aufnehmen"]'::jsonb,
 1, 20,
 'Handschrift hat den höchsten Lerneffekt – das langsamere Schreiben zwingt zum Mitdenken und Zusammenfassen. (Kapitel 10)', 11),

-- 12) App-Liste
('00000000-0000-4000-8000-000000000074',
 'Welche App ist die zentrale Schulplattform für E-Mail, Aufgaben und Dateien?',
 '["WhatsApp", "IServ", "Instagram", "TikTok"]'::jsonb,
 1, 10,
 'IServ ist die zentrale Schulplattform. Immer aktuell halten! (Kapitel 3)', 12);
