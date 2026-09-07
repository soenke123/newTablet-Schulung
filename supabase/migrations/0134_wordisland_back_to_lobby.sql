-- ══════════════════════════════════════════════════════════════
-- Migration 0134 — Myth of Wordisland: zurück in die Lobby
-- ══════════════════════════════════════════════════════════════
-- Sönkes Befund (2026-09-08): „Wenn ich auf ‚Runde beenden' klicke,
-- kann ich im nächsten Bild auf ‚Neue Runde' klicken. Aber dann
-- startet die Runde neu. Ich will dann erstmal in der Lobby landen,
-- um Sachen zu ändern."
--
-- Und er hat recht: zwischen zwei Runden ändert sich fast immer
-- etwas. Andere Unit, andere Richtung, ein Volk mehr, weil die
-- Nachbarklasse dazukommt. Bisher führte aus der Auswertung nur EIN
-- Weg, und der ging an der Lobby vorbei — wi_room_start würfelt die
-- Insel und stellt den Countdown, ohne je zu fragen. Wer etwas
-- ändern wollte, musste die Runde starten, sofort wieder beenden und
-- hoffen, dass … nein, auch das führte wieder hierher.
--
-- Es fehlt also nicht ein Knopf, sondern ein ZUSTANDSÜBERGANG:
-- ended → lobby. Den kann die Oberfläche nicht erfinden.
--
-- ── Was dabei weggeräumt wird ─────────────────────────────────
-- Die Insel. Eine Lobby mit der Insel der letzten Runde im Rücken
-- wäre eine Lüge: die nächste Runde würfelt ohnehin eine neue
-- (wi_build_island löscht als Erstes), und bis dahin zeigte jede
-- Abfrage Felder und Punkte, die zu nichts mehr gehören.
--
-- Die AUFSTELLUNG bleibt dagegen stehen. Sie ist das, worauf die
-- Lehrkraft in der Lobby schaut, und sie ist zwischen zwei Runden
-- dieselbe Klasse. Neu gemischt wird beim Start (wi_seat_assign in
-- wi_room_start) oder von Hand (wi_room_shuffle) — beides
-- ausdrücklich, beides nicht hier.
--
-- Die laufende Aufgabe je Kind wird zurückgesetzt: Serie, freie
-- Wahl und Antwortsperre gehören zu der Runde, die gerade vorbei
-- ist. Was ein Kind KANN, steht in vocab_progress und bleibt — das
-- ist der Sinn der Wiedervorlage.
--
-- Kein DROP — `create or replace` (Regel:
-- feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

create or replace function wi_room_to_lobby(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
  v_b    wi_boards;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_b from wi_boards where room_id = v_room;

  -- Eine laufende Runde wird nicht „zurückgeklappt". Dafür gibt es
  -- wi_room_end, und den Weg soll die Lehrkraft bewusst gehen — sonst
  -- verschwindet eine Arena, in der dreißig Kinder gerade tippen,
  -- hinter einem Fehlgriff.
  if v_b.phase in ('countdown', 'running') then
    return jsonb_build_object('ok', false, 'error', 'round_running');
  end if;

  update wi_boards
     set phase             = 'lobby',
         countdown_ends_at = null,
         ends_at           = null,
         started_at        = null,
         ended_at          = null,
         winner_team       = null,
         presenter_seen_at = now()
   where room_id = v_room;

  delete from wi_tiles where room_id = v_room;

  update wi_players
     set current_item    = null,
         current_options = '{}',
         current_dir     = null,
         current_stage   = 'type',
         streak          = 0,
         picks           = 0,
         wrong_run       = 0,
         lock_until      = null
   where room_id = v_room;

  return jsonb_build_object('ok', true, 'phase', 'lobby');
end;
$$;

revoke all on function wi_room_to_lobby(text) from public;
grant execute on function wi_room_to_lobby(text) to authenticated;

comment on function wi_room_to_lobby(text) is
  'Bringt einen Raum aus der Auswertung zurück in die Lobby: Insel weg, Aufstellung bleibt, '
  'Einstellungen wieder änderbar. Eine laufende Runde lehnt sie ab (round_running).';


-- ─────────────────────────────────────────────────────────────
-- wi_room_setup — zieht `factions` jetzt nach
-- ─────────────────────────────────────────────────────────────
-- Beim Prüfstand zu 0134 aufgefallen: `p_teams` setzt team_count,
-- rührt `factions` aber nicht an. Seit 0133 ist das ein Widerspruch —
-- ein Board mit fünf Slots und zwei bekannten Völkern, bei dem die
-- hinteren Spalten in der Farbe ihres SLOTS dastehen.
--
-- Die Oberfläche ruft seit 0133 nur noch wi_room_set_factions auf; ein
-- Tablet mit alt zwischengespeicherter tool.js kann p_teams aber noch
-- schicken (genau der Fall, den Kingdoms in 0097 abgefangen hat). Also
-- hält die Funktion beides zusammen, statt sich darauf zu verlassen,
-- dass niemand mehr fragt.
--
-- Kleiner werden heißt: die hinteren Völker fallen weg. Größer werden
-- heißt: die noch nicht gewählten kommen in ihrer Reihenfolge dazu.
-- Beides hält die bisherige Auswahl so weit wie möglich fest.
--
-- Basis ist die Fassung aus 0131 — die einzige bisherige (Regel:
-- feedback_shop_state_merge_regressions gilt auch hier: nie aus einer
-- ÄLTEREN Migration abschreiben).
create or replace function wi_room_setup(
  p_code       text,
  p_sets       uuid[] default null,
  p_teams      int    default null,
  p_duration   int    default null,
  p_direction  text   default null,
  p_mode       text   default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
  v_b    wi_boards;
  v_fac  jsonb;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_b from wi_boards where room_id = v_room;
  -- Team-Zahl und Insel stehen nach dem Start fest. Units, Richtung
  -- und Modus dürfen weiter wechseln: „jetzt bitte andersherum"
  -- mitten in der Runde ist ein legitimer Zug der Lehrkraft.
  if v_b.phase <> 'lobby' and p_teams is not null and p_teams <> v_b.team_count then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  if p_teams is not null and p_teams <> v_b.team_count then
    -- Erst die bisherigen Völker in ihrer Reihenfolge, dann die noch
    -- freien aufsteigend — abgeschnitten auf die neue Zahl.
    select coalesce(jsonb_agg(v order by ord), '[]'::jsonb) into v_fac
      from (
        select v, ord from (
          select (e #>> '{}')::int as v, ord::int as ord
            from jsonb_array_elements(v_b.factions) with ordinality t(e, ord)
          union all
          select g, 100 + g
            from generate_series(0, 5) g
           where not exists (select 1 from jsonb_array_elements(v_b.factions) e2
                              where (e2 #>> '{}')::int = g)
        ) k
        order by ord
        limit p_teams
      ) x;

    v_fac := wi_normalize_factions(v_fac);
    if v_fac is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
  end if;

  update wi_boards
     set team_count    = coalesce(p_teams, team_count),
         factions      = coalesce(v_fac, factions),
         duration_secs = coalesce(p_duration, duration_secs),
         direction     = coalesce(p_direction, direction),
         mode          = coalesce(p_mode, mode)
   where room_id = v_room;

  -- Eine andere Zahl von Völkern heißt neue Aufstellung — sonst bliebe
  -- ein Kind in einem Slot sitzen, den es nicht mehr gibt (dieselbe
  -- Regel wie in wi_room_set_factions).
  if v_fac is not null then
    perform wi_seat_assign(v_room, p_teams);
  end if;

  if p_sets is not null then
    delete from wi_room_sets where room_id = v_room and not (set_id = any(p_sets));
    insert into wi_room_sets (room_id, set_id)
    select v_room, s.id from vocab_sets s
     where s.id = any(p_sets)
       and (s.owner_id is null or s.owner_id = auth.uid())
    on conflict do nothing;

    -- Die laufende Aufgabe kann aus einer eben abgewählten Unit
    -- stammen. Sie wird zurückgesetzt, sonst fragt das Tablet noch
    -- ein Wort ab, das gar nicht mehr dran ist.
    update wi_players set current_item = null where room_id = v_room;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function wi_room_setup(text, uuid[], int, int, text, text) from public;
grant execute on function wi_room_setup(text, uuid[], int, int, text, text) to authenticated;

comment on function wi_room_setup(text, uuid[], int, int, text, text) is
  'Einstellungen der Lobby in einem Aufruf. Seit 0134 zieht p_teams die Völker-Auswahl mit '
  '(factions) und verteilt die Klasse neu — beides darf nicht auseinanderlaufen.';
