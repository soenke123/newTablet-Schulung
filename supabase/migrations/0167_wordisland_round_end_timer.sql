-- ══════════════════════════════════════════════════════════════
-- Migration 0167 — Wordisland: das Rundenende lässt sich nachstellen
-- ══════════════════════════════════════════════════════════════
-- Sönke, 22.09.2026: „ähnlich wie bei Mathoria hätte ich gerne bei
-- dem ‚Runde beenden'-Knopf die Möglichkeit, die Zeit anzupassen. Der
-- Countdown läuft (voreingestellt), aber ich kann die Zeit
-- nachträglich ändern: jetzt beenden, in 1 min, in 2 min, in 3 min
-- oder in 5 min."
--
-- Der Fall aus dem Unterricht: die Stunde ist gleich um, die Runde
-- liefe noch sieben Minuten — oder umgekehrt, es ist spannend und es
-- fehlen zwei. Bis jetzt gab es dafür nur „Runde beenden", also
-- ganz oder gar nicht.
--
-- ── Eine Funktion, die nur EINE Spalte anfasst ────────────────
-- `wi_boards.ends_at` ist die einzige Wahrheit über das Rundenende;
-- `wi_maybe_advance` (0131, zuletzt 0146) liest sie beim nächsten
-- Takt und beendet die Runde, wenn sie vorbei ist. Es braucht also
-- weder Spalte noch Job: ein neues `ends_at` reicht, und die
-- bestehende Lazy-Auswertung tut den Rest — auch dann, wenn die
-- Lehrkraft „in 1 Minute" wählt und danach das Pult zuklappt.
--
-- `duration_secs` bleibt ausdrücklich unberührt. Sie ist die
-- VOREINSTELLUNG der nächsten Runde und die Zahl, aus der die Insel
-- gebaut wird (wi_build_island) — beides gilt für die laufende Runde
-- nicht mehr. Würde sie mitgezogen, hieße das: wer einmal
-- nachjustiert, hat die Einstellung für alle weiteren Runden
-- verstellt, ohne es zu wollen. Genau so hält es Kingdoms
-- (clash_room_set_match_timer, 0094): der Server kennt das Ende,
-- nicht die gewählte Dauer.
--
-- ── Nur in phase='running' ────────────────────────────────────
-- In 'countdown' gibt es noch kein `ends_at` — es entsteht erst in
-- `wi_maybe_advance`, wenn die fünf Sekunden um sind, und würde hier
-- Gesetztes sofort überschreiben. Der Countdown dauert fünf
-- Sekunden, das ist keine Zeit zum Nachstellen; die Antwort heißt
-- darum ehrlich 'not_running' statt still nichts zu tun. Das Gerät
-- sperrt das Auswahlfeld in dieser Phase ohnehin.
--
-- ── „Jetzt beenden" bleibt wi_room_end ────────────────────────
-- Es wäre möglich gewesen, das mit p_secs = 0 mitzuerledigen. Dann
-- hinge das Ende aber daran, dass gleich jemand hinsieht: bis zum
-- nächsten Takt stünde eine Runde da, die abgelaufen ist und sich
-- noch spielen lässt. `wi_room_end` setzt phase und Sieger selbst —
-- das ist ein anderer Vorgang und bleibt eine eigene Funktion.
--
-- Untergrenze 15 Sekunden: kürzer ist kein Nachstellen mehr,
-- sondern ein Beenden mit Umweg. Obergrenze 3600 wie
-- wi_boards.duration_secs.
--
-- Kein DROP — die Funktion ist neu (Regel:
-- feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

create or replace function wi_room_set_end(p_code text, p_secs int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  -- Prüft die Lehrkraft und stempelt presenter_seen_at (0131) — der
  -- Aufruf ist selbst schon das Lebenszeichen, das die Arena offen
  -- hält.
  v_room uuid := wi_owned_room(p_code);
  v_b    wi_boards;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_secs is null or p_secs < 15 or p_secs > 3600 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  update wi_boards
     set ends_at = now() + make_interval(secs => p_secs)
   where room_id = v_room
     and phase = 'running'
  returning * into v_b;

  if v_b.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_running');
  end if;

  return jsonb_build_object('ok', true, 'ends_at', v_b.ends_at);
end;
$$;

comment on function wi_room_set_end(text, int) is
  'Setzt das Ende der LAUFENDEN Runde auf jetzt + p_secs. Rührt duration_secs nicht an (0167).';

revoke all on function wi_room_set_end(text, int) from public;
grant execute on function wi_room_set_end(text, int) to authenticated;
