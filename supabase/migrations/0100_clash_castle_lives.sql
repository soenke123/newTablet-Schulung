-- ══════════════════════════════════════════════════════════════
-- Migration 0100 — Kingdoms of Mathoria: Burgen haben drei Leben
-- ══════════════════════════════════════════════════════════════
-- Die „Burg-Leben" standen schon im Aufriss von 0093 ausdrücklich als
-- Sache der Feature-Runde. Hier sind sie.
--
-- ── Die Regel ──────────────────────────────────────────────────
-- Eine Burg hat drei Leben. Trifft eine richtige Antwort sie, kostet
-- das EIN Leben; die Kachel bleibt beim bisherigen Volk. Wer das
-- LETZTE Leben abzieht, bekommt die Burg — sie verschwindet nicht,
-- sondern wechselt das Volk und steht mit vollen drei Leben wieder da.
-- Man erobert die Burg, man schleift sie nicht.
--
-- Damit kann ein Volk MEHRERE Burgen besitzen. Das ist Absicht und
-- der eigentliche Reiz der Regel — der Client zeichnet seit dem
-- zugehörigen Durchgang deshalb alle Burgkacheln eines Volkes, nicht
-- mehr nur die erste.
--
-- ── Warum eine Spalte an clash_tiles und keine eigene Tabelle ──
-- Die Leben gehören zur Kachel wie ihr Besitzer: dieselbe Zeile,
-- dieselbe Sperre, dasselbe updated_at. Eine zweite Tabelle hieße,
-- bei jedem Treffer zwei Zeilen konsistent zu halten, und genau das
-- ist der Fall, in dem es schiefgeht (eine ganze Klasse gibt
-- gleichzeitig ab). Nicht-Burgkacheln tragen den Vorgabewert 3 mit
-- sich herum, ohne dass ihn je jemand liest — das ist billiger als
-- jede Alternative.
--
-- ── clash_sig_of bleibt unangetastet ───────────────────────────
-- Ein Treffer ohne Übernahme ändert `owner_team` nicht, aber sehr
-- wohl `updated_at` — und max(updated_at) über clash_tiles steckt
-- seit 0093 in der Signatur. Die Herzen am Beamer aktualisieren sich
-- dadurch von selbst, ohne dass die Signatur breiter wird.
--
-- ⚠️ `clash_room_get` und `clash_view` werden NEU DEKLARIERT —
-- Grundlage ist jeweils 0099 (die höchste bestehende Fassung), sonst
-- fielen team_correct_counts, my_team_members, team_members,
-- offline_members oder factions wieder weg.
-- Regel: feedback_shop_state_merge_regressions.
--
-- Neu ist in beiden nur, dass die Kachelliste aus clash_tiles_json()
-- kommt statt aus einem inline zusammengebauten jsonb_agg. Das ist
-- ausdrücklich Teil des Zwecks: die nächste Erweiterung an der
-- Kachel muss dann nicht wieder zwei 130-Zeilen-Funktionen kopieren.
--
-- Kein DROP — `create or replace` bzw. `add column if not exists`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Die Leben an der Kachel
-- ─────────────────────────────────────────────────────────────
-- Vorgabe 3 auch für laufende Räume: eine Partie, die gerade läuft,
-- bekommt dadurch mitten im Spiel Burgen mit vollen Leben. Das ist
-- der harmlosere von zwei Fällen — die Alternative (0) hieße, dass
-- jede Burg im nächsten Augenblick fällt.
alter table clash_tiles
  add column if not exists castle_hp int not null default 3;

comment on column clash_tiles.castle_hp is
  'Verbleibende Leben einer Burg (0100). Nur für is_castle-Zeilen bedeutsam; wer das letzte '
  'abzieht, übernimmt die Burg, die dann wieder auf 3 steht.';


-- ─────────────────────────────────────────────────────────────
-- 2) Die Kachelliste an EINER Stelle
-- ─────────────────────────────────────────────────────────────
-- Bis hierher stand derselbe jsonb_agg-Block wortgleich in
-- clash_room_get UND clash_view — und wurde bei jeder Erweiterung in
-- beiden Funktionen mitkopiert. Ab jetzt einmal.
--
-- `hp` steht nur an Burgkacheln; an allen anderen ist es json null,
-- damit der Client gar nicht erst in Versuchung kommt, Leben an einem
-- gewöhnlichen Feld anzuzeigen.
create or replace function clash_tiles_json(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'r', r, 'c', c, 'team', owner_team, 'castle', is_castle,
           'hp', case when is_castle then castle_hp else null end
         )), '[]'::jsonb)
    from clash_tiles where room_id = p_room;
$$;

revoke all on function clash_tiles_json(uuid) from public;

comment on function clash_tiles_json(uuid) is
  'Die Felder eines Raums als [{r,c,team,castle,hp}, …] — gemeinsame Quelle für clash_room_get '
  'und clash_view (0100). Interner Helfer, kein Grant an anon/authenticated.';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_submit_answer — Treffer, Übernahme, Eroberung
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0093 (bisher die einzige Fassung). Geändert ist nur der
-- Block zwischen „Kandidatenfeld gefunden" und „Frage nachziehen".
--
-- Die Burg ist ein Kandidat wie jedes andere Grenzfeld — sie wird
-- NICHT bevorzugt und auch nicht geschont. Wer das Pech hat, dreimal
-- dieselbe Burg zu ziehen, hat sie erobert; wer sie einmal anritzt,
-- hat dem eigenen Volk trotzdem geholfen. Eine Sonderregel („erst die
-- Felder, dann die Burg") wäre eine Taktik-Entscheidung, die niemand
-- treffen kann: welches Feld drankommt, entscheidet der Zufall, nicht
-- das Kind.
--
-- WICHTIG für den Client: `captured` meldet ab jetzt ausschließlich
-- einen tatsächlichen Besitzerwechsel. Ein Burgtreffer ohne Übernahme
-- kommt als `castle_hit`. Hätte der Treffer weiter unter `captured`
-- gestanden, würde das Tablet die Kachel sofort umfärben — und der
-- nächste Takt vom Server nähme sie wieder weg.
create or replace function clash_submit_answer(p_token text, p_answer int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p       skill_participants;
  v_room    skill_rooms;
  v_board   clash_boards;
  v_player  clash_players;
  v_correct boolean;
  v_tr      int;
  v_tc      int;
  v_tprev   int;
  v_castle  boolean := false;
  v_hp      int;
  v_taken   boolean := false;   -- Besitzer hat gewechselt
  v_hit_hp  int := null;        -- Burg getroffen, aber nicht gefallen
  v_alive_n int;
  v_q       record;
  i         int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  if v_board.phase <> 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_running', 'phase', v_board.phase);
  end if;

  perform clash_ensure_player(v_p.id, v_room.id);
  select * into v_player from clash_players where participant_id = v_p.id;
  if v_player.participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not exists (
    select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
  ) then
    return jsonb_build_object('ok', false, 'error', 'team_eliminated');
  end if;

  -- Randfall: keine laufende Frage (sollte durch clash_ensure_player/
  -- clash_room_start nicht vorkommen) — dann erst eine ziehen, ohne
  -- die abgegebene Zahl zu werten.
  if v_player.current_a is null then
    select * into v_q from clash_new_question();
    update clash_players set current_a = v_q.a, current_b = v_q.b
     where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'correct', null,
      'question', jsonb_build_object('a', v_q.a, 'b', v_q.b));
  end if;

  v_correct := (p_answer = v_player.current_a + v_player.current_b);

  if v_correct then
    for i in 1..3 loop
      v_tr := null; v_tc := null; v_tprev := null; v_castle := false; v_hp := null;
      select t.r, t.c, t.owner_team, t.is_castle, t.castle_hp
        into v_tr, v_tc, v_tprev, v_castle, v_hp
        from clash_tiles t
       where t.room_id = v_room.id
         and t.owner_team <> v_player.team_index
         and exists (
           select 1 from clash_tiles m
            where m.room_id = t.room_id
              and m.owner_team = v_player.team_index
              and clash_is_neighbor(m.r, m.c, t.r, t.c)
         )
       order by random()
       limit 1
         for update of t skip locked;
      exit when v_tr is not null;
    end loop;

    if v_tr is not null then
      if v_castle and coalesce(v_hp, 3) > 1 then
        -- Angeschlagen, aber noch nicht gefallen. `updated_at` wird
        -- mitgesetzt, damit clash_sig_of den Treffer sieht (siehe
        -- Kopf dieser Datei).
        update clash_tiles
           set castle_hp = castle_hp - 1, updated_at = now()
         where room_id = v_room.id and r = v_tr and c = v_tc;
        v_hit_hp := coalesce(v_hp, 3) - 1;
      else
        -- Gewöhnliches Feld ODER das letzte Leben einer Burg: der
        -- Besitzer wechselt. is_castle bleibt, wie es war — eine
        -- eroberte Burg IST weiter eine Burg, nur eben die des
        -- Siegervolkes, und beginnt wieder mit drei Leben.
        update clash_tiles
           set owner_team = v_player.team_index,
               castle_hp  = 3,
               updated_at = now()
         where room_id = v_room.id and r = v_tr and c = v_tc;
        v_taken := true;
      end if;
    end if;

    update clash_players
       set streak = streak + 1, correct_count = correct_count + 1
     where participant_id = v_p.id;
  else
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1
     where participant_id = v_p.id;
  end if;

  select * into v_q from clash_new_question();
  update clash_players set current_a = v_q.a, current_b = v_q.b
   where participant_id = v_p.id;

  -- Nur ein echter Besitzerwechsel kann ein Volk ausgelöscht haben.
  if v_taken then
    select count(distinct owner_team) into v_alive_n
      from clash_tiles where room_id = v_room.id;
    if v_alive_n <= 1 then
      update clash_boards
         set phase = 'ended', ended_at = now(),
             winner_team = (select owner_team from clash_tiles
                              where room_id = v_room.id limit 1)
       where room_id = v_room.id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'captured', case when v_taken
                 then jsonb_build_object('r', v_tr, 'c', v_tc, 'prev_owner', v_tprev,
                                         'castle', v_castle, 'hp', 3)
                 else null end,
    'castle_hit', case when v_hit_hp is not null
                 then jsonb_build_object('r', v_tr, 'c', v_tc, 'hp', v_hit_hp,
                                         'owner', v_tprev)
                 else null end,
    'streak', (select streak from clash_players where participant_id = v_p.id),
    'question', jsonb_build_object('a', v_q.a, 'b', v_q.b)
  );
end;
$$;

revoke all on function clash_submit_answer(text, int) from public;
grant execute on function clash_submit_answer(text, int) to anon, authenticated;

comment on function clash_submit_answer(text, int) is
  'Eine Antwort abgeben. Seit 0100 haben Burgen drei Leben: `captured` meldet nur noch einen '
  'echten Besitzerwechsel (mit castle=true, wenn eine Burg übernommen wurde), ein Treffer ohne '
  'Übernahme kommt als `castle_hit` mit den verbliebenen Leben.';


-- ─────────────────────────────────────────────────────────────
-- 4) clash_room_get — Kacheln inkl. Leben für den Beamer
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0099 (die höchste bestehende Fassung). Einziger
-- Unterschied ist die Kachelliste aus clash_tiles_json.
create or replace function clash_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
  v_teams jsonb;
  v_tiles jsonb;
  v_status jsonb;
  v_correct jsonb;
  v_members jsonb;
  v_offline jsonb;
  v_online_count int;
  v_room_total   int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;
  perform skill_touch(v_room.id);

  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    into v_teams
    from (
      select team_index, count(*) as cnt
        from clash_preview_teams(v_room.id)
       group by team_index
    ) t;

  -- Namen je Team. Sortiert nach Sitzplatz, damit die Reihenfolge
  -- zwischen zwei Abrufen nicht springt.
  if v_board.phase = 'lobby' then
    select coalesce(jsonb_object_agg(team_index, names), '{}'::jsonb)
      into v_members
      from (
        select t.team_index,
               jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat) as names
          from clash_preview_teams(v_room.id) t
          join skill_participants p on p.id = t.participant_id
         group by t.team_index
      ) x;
  else
    -- clash_players trägt keine room_id — der Join über den
    -- Teilnehmer grenzt auf diesen Raum ein.
    select coalesce(jsonb_object_agg(team_index, names), '{}'::jsonb)
      into v_members
      from (
        select pl.team_index,
               jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat) as names
          from clash_players pl
          join skill_participants p on p.id = pl.participant_id
         where p.room_id = v_room.id
         group by pl.team_index
      ) x;
  end if;

  -- Wer im Raum ist, aber in keinem Team steht. Bewusst als Komplement
  -- zu clash_preview_teams statt mit einer eigenen Kopie der
  -- 90-Sekunden-Grenze: „nicht in einem Team ⇒ steht unten" soll auch
  -- dann noch gelten, wenn sich die Grenze einmal ändert.
  select coalesce(jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat), '[]'::jsonb)
    into v_offline
    from skill_participants p
   where p.room_id = v_room.id
     and p.id not in (select participant_id from clash_preview_teams(v_room.id));

  select count(*) into v_online_count from clash_preview_teams(v_room.id);
  select count(*) into v_room_total from skill_participants where room_id = v_room.id;

  v_tiles := clash_tiles_json(v_room.id);

  select coalesce(jsonb_object_agg(owner_team, cnt), '{}'::jsonb)
    into v_status
    from (
      select owner_team, count(*) as cnt
        from clash_tiles where room_id = v_room.id
       group by owner_team
    ) t;

  v_correct := clash_team_correct(v_room.id);

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'team_members', v_members,
    'offline_members', v_offline,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'team_tile_counts', v_status,
    'team_correct_counts', v_correct
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-Ansicht von Kingdoms of Mathoria. Seit 0096 team_members, seit 0097 factions und '
  'offline_members, seit 0099 team_correct_counts, seit 0100 tragen Burgkacheln ihre '
  'verbliebenen Leben als `hp` (Kachelliste aus clash_tiles_json).';


-- ─────────────────────────────────────────────────────────────
-- 5) clash_view — Kacheln inkl. Leben für das Tablet
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0099 (die höchste bestehende Fassung — sonst fielen
-- my_team_members und team_correct_counts wieder weg). Einziger
-- Unterschied ist die Kachelliste aus clash_tiles_json.
create or replace function clash_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p            skill_participants;
  v_room         skill_rooms;
  v_board        clash_boards;
  v_player       clash_players;
  v_my_team      int;
  v_alive        boolean := true;
  v_question     jsonb := null;
  v_teams        jsonb;
  v_correct      jsonb;
  v_my_members   jsonb := '[]'::jsonb;
  v_tiles        jsonb;
  v_online_count int;
  v_room_total   int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  -- Muss VOR clash_preview_teams laufen, sonst zählt sich der
  -- aufrufende Teilnehmer bei einem gerade erst abgelaufenen
  -- 1-Minuten-Fenster selbst noch nicht als online.
  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    into v_teams
    from (
      select team_index, count(*) as cnt
        from clash_preview_teams(v_room.id)
       group by team_index
    ) t;

  select count(*) into v_online_count from clash_preview_teams(v_room.id);
  select count(*) into v_room_total from skill_participants where room_id = v_room.id;

  if v_board.phase = 'lobby' then
    select team_index into v_my_team
      from clash_preview_teams(v_room.id)
     where participant_id = v_p.id;
  else
    perform clash_ensure_player(v_p.id, v_room.id);
    select * into v_player from clash_players where participant_id = v_p.id;
    v_my_team := v_player.team_index;
    if v_board.phase = 'running' then
      v_alive := exists (
        select 1 from clash_tiles where room_id = v_room.id and owner_team = v_my_team
      );
      if v_alive then
        v_question := jsonb_build_object('a', v_player.current_a, 'b', v_player.current_b);
      end if;
    end if;
  end if;

  -- Die eigene Gruppe, sortiert nach Sitzplatz, damit die Reihenfolge
  -- zwischen zwei Abrufen nicht springt. Ohne eigenes Volk (nicht
  -- online, noch keine Zuordnung) bleibt die Liste leer.
  if v_my_team is not null then
    if v_board.phase = 'lobby' then
      select coalesce(jsonb_agg(
               jsonb_build_object('name', skill_seat_name(p.name, p.seat),
                                  'me',   p.id = v_p.id)
               order by p.seat), '[]'::jsonb)
        into v_my_members
        from clash_preview_teams(v_room.id) t
        join skill_participants p on p.id = t.participant_id
       where t.team_index = v_my_team;
    else
      -- clash_players trägt keine room_id — der Join über den
      -- Teilnehmer grenzt auf diesen Raum ein.
      select coalesce(jsonb_agg(
               jsonb_build_object('name', skill_seat_name(p.name, p.seat),
                                  'me',   p.id = v_p.id)
               order by p.seat), '[]'::jsonb)
        into v_my_members
        from clash_players pl
        join skill_participants p on p.id = pl.participant_id
       where p.room_id = v_room.id and pl.team_index = v_my_team;
    end if;
  end if;

  v_tiles := clash_tiles_json(v_room.id);

  v_correct := clash_team_correct(v_room.id);

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'team_correct_counts', v_correct,
    'my_team_members', v_my_members,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'me', jsonb_build_object(
      'team',    v_my_team,
      'alive',   v_alive,
      'streak',  coalesce(v_player.streak, 0),
      'question', v_question,
      'seat',    v_p.seat,
      'name',    skill_seat_name(v_p.name, v_p.seat)
    )
  );
end;
$$;

revoke all on function clash_view(text) from public;
grant execute on function clash_view(text) to anon, authenticated;

comment on function clash_view(text) is
  'Teilnehmer-Ansicht von Kingdoms of Mathoria. Seit 0098 my_team_members und me.name, seit '
  '0099 team_correct_counts, seit 0100 tragen Burgkacheln ihre verbliebenen Leben als `hp` '
  '(Kachelliste aus clash_tiles_json).';
