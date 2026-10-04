-- ═══════════════════════════════════════════════════════════════
-- 0191 — Knowledge Stack: Auftritt vor der ersten Frage
-- ═══════════════════════════════════════════════════════════════
-- Sönke (04.10.2026): Wenn eine Runde startet, steht am Beamer erst
-- „Quiz startet" mit dem Namen des Fragenkatalogs, alle Wesen fallen
-- von oben herein und laufen rechts hinaus — dann erst kommt die
-- erste Frage. Auf den Tablets steht in der Zeit nur das eigene
-- Wesen und „Gleich geht's los!".
--
-- Der Auftritt braucht Zeit, und die darf nicht von der Vorlesezeit
-- der ersten Frage abgehen. Deshalb liegt phase_ends_at der ERSTEN
-- Frage einer Runde 10 Sekunden weiter hinten (v_intro). Alles
-- andere bleibt: ks_answer rechnet die Öffnung der Antworten aus
-- phase_ends_at − Antwortzeit (0189) und wartet damit von allein;
-- das Frontend (tool.js, INTRO_SEC) zieht die 5 Sekunden Vorlesezeit
-- ab und zeigt den Rest als Auftritt. Ohne diese Migration ist der
-- Rest nie größer als 5 Sekunden — dann gibt es keinen Auftritt,
-- und alles läuft wie vorher.
--
-- Die 10 hier MÜSSEN zu INTRO_SEC in tool.js passen.
--
-- Kein DROP, kein ALTER. Mehrfach ausführbar.
-- ═══════════════════════════════════════════════════════════════

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
  v_intro    int := 10;   -- Sekunden Auftritt vor der ersten Frage (0191)
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
      -- + Auftritt (nur die erste Frage der Runde)
      update ks_boards
         set phase          = 'question',
             current_q_idx  = 0,
             phase_ends_at  = now() + ((coalesce(v_q.time_limit_sec, 20) + 5) * interval '1 second')
                              + (v_intro * interval '1 second'),
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
