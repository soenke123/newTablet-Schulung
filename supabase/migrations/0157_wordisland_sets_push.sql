-- ══════════════════════════════════════════════════════════════
-- Migration 0157 — Wordisland: Sofort-Push + Schüler-Benachrichtigung
-- ══════════════════════════════════════════════════════════════
-- Zwei Verbesserungen:
--
--   A) sets_changed_at in wi_boards
--      wi_room_setup setzt dieses Feld, wenn die Lehrkraft ihre
--      Units ändert. wi_view liefert es ans Tablet. Das Tablet
--      setzt soloClaimAt auf 0, sobald sich der Wert ändert —
--      der nächste 4-Sek.-Takt feuert dann sofort wi_solo_claim
--      statt bis zu 90 Sek. zu warten.
--
--   B) wi_solo_claim liefert new_sets
--      Statt nur `added` (Anzahl) gibt die Funktion jetzt auch
--      die Namen der NEU hinzugefügten Stationen zurück:
--      [{unit, station}]. Das Tablet zeigt sie als Flash-Nachricht.
--
-- Kein DROP — Idempotenz per `if not exists` / `create or replace`.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- A1) wi_boards: Spalte sets_changed_at
-- ─────────────────────────────────────────────────────────────
alter table wi_boards
  add column if not exists sets_changed_at timestamptz;

comment on column wi_boards.sets_changed_at is
  'Wann die Lehrkraft zuletzt ihre Unit-Auswahl geändert hat '
  '(wi_room_setup mit p_sets). Tablets erkennen daran, ob sie '
  'sofort wi_solo_claim aufrufen sollen.';


-- ─────────────────────────────────────────────────────────────
-- A2) wi_room_setup — setzt sets_changed_at bei Set-Änderung
-- ─────────────────────────────────────────────────────────────
-- Alle Parameter identisch zu 0131 — nur zwei Zeilen neu:
--   • sets_changed_at = now()  im UPDATE wenn p_sets übergeben
--   • Rückgabe enthält sets_changed_at
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

  update wi_boards
     set team_count      = coalesce(p_teams, team_count),
         duration_secs   = coalesce(p_duration, duration_secs),
         direction        = coalesce(p_direction, direction),
         mode             = coalesce(p_mode, mode),
         -- NEU: Zeitstempel nur aktualisieren, wenn wirklich Sets
         -- übergeben wurden — nicht bei Modus/Richtungs-Wechseln.
         sets_changed_at  = case when p_sets is not null then now()
                                 else sets_changed_at end
   where room_id = v_room;

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


-- ─────────────────────────────────────────────────────────────
-- A3) wi_view — liefert sets_changed_at ans Tablet
-- ─────────────────────────────────────────────────────────────
-- Alle anderen Felder identisch zu 0131. Nur sets_changed_at
-- wird als ISO-Timestamp-Text neu hinzugefügt.
create or replace function wi_view(p_token text, p_full boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_b    wi_boards;
  v_pl   wi_players;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  v_b := wi_ensure_board(v_room.id);
  v_b := wi_maybe_advance(v_room.id);

  if v_b.phase in ('countdown', 'running') then
    v_pl := wi_ensure_player(v_p.id, v_room.id, v_b.team_count);
    if v_pl.current_item is null and v_b.phase = 'running' then
      perform wi_next_task(v_p.id, v_room.id);
      select * into v_pl from wi_players where participant_id = v_p.id;
    end if;
  else
    v_pl := wi_ensure_player(v_p.id, v_room.id, v_b.team_count);
    if v_pl.current_item is null then
      perform wi_next_task(v_p.id, v_room.id);
      select * into v_pl from wi_players where participant_id = v_p.id;
    end if;
  end if;

  return jsonb_build_object(
    'ok',      true,
    'role',    'participant',
    'phase',   v_b.phase,
    'mode',    v_b.mode,
    'teams',   wi_teams_json(v_room.id, v_b.team_count),
    'map_key', v_b.room_id::text || ':' || coalesce(v_b.started_at, v_b.created_at)::text,
    'map',     case when p_full then wi_map_json(v_room.id) else null end,
    'own',     wi_own_string(v_room.id),
    'ends_at', v_b.ends_at,
    'countdown_ends_at', v_b.countdown_ends_at,
    -- NEU: Tablet erkennt Set-Änderungen der Lehrkraft daran
    'sets_changed_at', v_b.sets_changed_at,
    'me', jsonb_build_object(
            'seat',    v_p.seat,
            'name',    coalesce(v_p.name, 'Tablet ' || v_p.seat),
            'team',    v_pl.team_index,
            'streak',  v_pl.streak,
            'picks',   v_pl.picks,
            'correct', v_pl.correct_count,
            'wrong',   v_pl.wrong_count,
            'locked_for', greatest(0, ceil(extract(epoch from
                            coalesce(v_pl.lock_until, now()) - now()))::int),
            'task',    wi_task_json(v_pl))
  );
end;
$$;

revoke all on function wi_view(text, boolean) from public;
grant execute on function wi_view(text, boolean) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- B) wi_solo_claim — gibt new_sets mit Unit/Stations-Namen zurück
-- ─────────────────────────────────────────────────────────────
-- Statt `get diagnostics v_added = row_count` wird nun
-- INSERT ... RETURNING genutzt, um die tatsächlich neu
-- eingefügten set_ids zu kennen. Daraus werden Unit- und
-- Stationsname gelesen und als new_sets zurückgegeben.
create or replace function wi_solo_claim(p_token text, p_solo text default null)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p        skill_participants;
  v_l        wi_solo_learners;
  v_sets     uuid[];
  v_added    int := 0;
  v_new_ids  uuid[];
  v_new_sets jsonb;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select array_agg(set_id) into v_sets from wi_room_sets where room_id = v_p.room_id;
  if v_sets is null or array_length(v_sets, 1) is null then
    -- Nichts zu holen. Ausdrücklich KEIN Fehler: die Lehrkraft hat
    -- ihre Units nur noch nicht gewählt, und das Tablet ruft gleich
    -- wieder an.
    return jsonb_build_object('ok', true, 'added', 0, 'new_sets', '[]'::jsonb, 'token', null);
  end if;

  v_l := wi_solo_resolve(p_solo);
  if v_l.id is null then
    v_l := wi_solo_create();
  end if;

  -- INSERT ... RETURNING: nur die tatsächlich neu eingefügten IDs
  with inserted as (
    insert into wi_solo_sets (learner_id, set_id, from_room)
    select v_l.id, s, v_p.room_id from unnest(v_sets) s
    on conflict (learner_id, set_id) do nothing
    returning set_id
  )
  select array_agg(set_id), count(*)::int
    into v_new_ids, v_added
    from inserted;

  -- Namen der neuen Stationen für die Tablet-Benachrichtigung
  if v_new_ids is not null and array_length(v_new_ids, 1) > 0 then
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'unit',    u.title,
               'station', s.title
             )
             order by coalesce(u.sort_order, 0), coalesce(s.sort_order, 0), s.title
           ), '[]'::jsonb)
      into v_new_sets
      from vocab_sets s
      left join vocab_units u on u.id = s.unit_id
     where s.id = any(v_new_ids);
  else
    v_new_sets := '[]'::jsonb;
  end if;

  update wi_solo_learners set last_seen_at = now() where id = v_l.id;

  return jsonb_build_object(
    'ok',       true,
    'added',    coalesce(v_added, 0),
    'new_sets', v_new_sets,
    -- Nur bei einer Geräte-Insel, und dann muss das Tablet ihn
    -- behalten: ohne den Token findet niemand die Insel wieder.
    'token', v_l.token,
    'words', (select count(*) from wi_solo_sets ss
                join vocab_items i on i.set_id = ss.set_id
               where ss.learner_id = v_l.id));
end;
$$;

revoke all on function wi_solo_claim(text, text) from public;
grant execute on function wi_solo_claim(text, text) to anon, authenticated;

comment on function wi_solo_claim(text, text) is
  'p_token ist der RAUM-Token (Reihenfolge von lib/tool.js erzwungen), p_solo der Insel-Token. '
  'Additiv und idempotent; legt die Insel nur an, wenn der Raum wirklich Units hat. '
  'Seit 0157: new_sets enthält [{unit, station}] der neu hinzugefügten Stationen.';
