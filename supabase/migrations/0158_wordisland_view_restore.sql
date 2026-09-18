-- ═══════════════════════════════════════════════════════════════
-- 0158 — Wordisland: wi_view zurückholen + Zahlen für das Siegerbild
-- ═══════════════════════════════════════════════════════════════
-- Sönkes Meldung: „Die Farben der Völker waren am Tablet und am
-- Beamer unterschiedlich."
--
-- ══ Was passiert ist ═══════════════════════════════════════════
-- Die beiden Rollen fragen verschiedene Funktionen: das Pult ruft
-- wi_room_get, das Tablet wi_view. Migration 0157 hat wi_view neu
-- deklariert und im Kopf steht dort wörtlich „Alle anderen Felder
-- identisch zu 0131". 0131 ist aber der Stand VOR 0133 — die neu
-- geschriebene Fassung hat damit alles verloren, was zwischen 0133
-- und 0152 dazugekommen war:
--
--   0133  factions, team_count, my_team_members,
--         online_count, room_total
--   0146  ruins, hearts, me.shadow_pick
--   0151  streak_goals
--   0152  der blocked-Riegel und die Gruppe ohne Stillgelegte
--   —     winner_team
--
-- Die FARBEN sind davon nur der sichtbarste Teil: ohne `factions`
-- fällt das Gerät auf `Volk = Slot` zurück (der Zustand vor 0133) und
-- malt stur Rot·Blau·Grün·Gelb, während das Pult die Völker zeigt,
-- die die Lehrkraft in der Lobby gewählt hat.
--
-- Der wirkliche Schaden liegt daneben: stillgelegte Tablets spielten
-- wieder mit, Ruinen standen ohne Herzen und ohne Wertigkeit da, und
-- der Sieger kam am Tablet gar nicht mehr an.
--
-- ⚠️ REGEL, und sie gilt für jede weitere Wordisland-Migration:
--    Wer eine Funktion neu deklariert, nimmt die HÖCHSTE bestehende
--    Fassung als Basis — nicht die, in der das Feature geboren wurde.
--    Diese Migration ist die 0152-Fassung von wi_view plus die eine
--    Zeile, die 0157 eigentlich bringen wollte (sets_changed_at).
--
-- ══ Und ein Feld mehr ══════════════════════════════════════════
-- Wordisland bekommt ein richtiges Siegerbild (Podest an Beamer und
-- Tablet, Muster von Kingdoms). Dafür fehlt eine Zahl: wie viele
-- Wörter ein VOLK richtig hatte. wi_teams_json kennt bisher nur
-- Felder, Ruinenwert, Punkte und Köpfe. Kingdoms hat dieselbe Zahl
-- seit 0099 (clash_team_correct_counts) und benutzt sie an zwei
-- Stellen: als zweite Angabe auf der Podest-Karte und als
-- Stichentscheid, wenn zwei Völker gleich viele Punkte haben.
--
-- Der SIEGER wird davon nicht berührt — welches Volk gewonnen hat,
-- entscheidet weiterhin allein der Server in wi_maybe_advance
-- (`winner_team`). Eine zweite Rechnung im Gerät könnte der
-- Überschrift widersprechen.
--
-- Kein DROP — alles `create or replace`.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wi_teams_json — dieselben Zahlen, plus `correct`
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0152, Wort für Wort. Neu ist allein `correct` in der
-- Ausgabe und die Summe im rechten Unterabfrage-Block — sie läuft
-- ohnehin schon über wi_players und zählt dort seit 0152 nur
-- Tablets mit, die auch spielen dürfen. Ein stillgelegtes Kind
-- trägt seine Treffer also weder zur Kopfzahl noch zum
-- Stichentscheid bei.
--
-- Beide Rollen lesen dieselbe Funktion: das Feld steht damit im
-- selben Moment am Pult und am Tablet.
create or replace function wi_teams_json(p_room uuid, p_teams int)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select coalesce(jsonb_agg(x order by (x->>'i')::int), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'i',       t.i,
               'tiles',   coalesce(f.n, 0),
               'ruins',   coalesce(f.rv, 0),
               'score',   coalesce(f.n, 0) + coalesce(f.rv, 0),
               'people',  coalesce(p.n, 0),
               'correct', coalesce(p.c, 0)              -- 0158
             ) as x
        from generate_series(0, p_teams - 1) as t(i)
        left join (
          select owner_team, count(*) n,
                 sum(case when ruin_kind is null then 0 else ruin_value - 1 end) rv
            from wi_tiles where room_id = p_room and owner_team is not null
           group by owner_team
        ) f on f.owner_team = t.i
        left join (
          select w.team_index, count(*) n,
                 sum(coalesce(w.correct_count, 0)) c                -- 0158
            from wi_players w
            join skill_participants sp on sp.id = w.participant_id   -- 0152
           where w.room_id = p_room
             and not sp.blocked                                      -- 0152
           group by w.team_index
        ) p on p.team_index = t.i
    ) s;
$$;

comment on function wi_teams_json(uuid, int) is
  'Felder, Ruinenwert, Punktzahl und Kopfzahl je Volk. Seit 0152 zählt die Kopfzahl nur '
  'Tablets, die auch spielen dürfen. Seit 0158 zusätzlich `correct`: die richtig '
  'beantworteten Wörter des ganzen Volkes — zweite Angabe auf der Podest-Karte und '
  'Stichentscheid bei gleicher Punktzahl.';


-- ─────────────────────────────────────────────────────────────
-- 2) wi_view — die Fassung von 0152, plus sets_changed_at
-- ─────────────────────────────────────────────────────────────
-- Zeile für Zeile die 0152-Fassung. Die EINZIGE Ergänzung ist
-- `sets_changed_at` in der Rückgabe — der Zweck von 0157: das Tablet
-- erkennt daran, dass die Lehrkraft ihre Units geändert hat, und
-- ruft sofort wi_solo_claim, statt bis zu 90 Sekunden zu warten.
create or replace function wi_view(p_token text, p_full boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p      skill_participants;
  v_room   skill_rooms;
  v_b      wi_boards;
  v_pl     wi_players;
  v_my     jsonb := '[]'::jsonb;
  v_online int;
  v_total  int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  -- 0152: gleicher Code wie in skill_view — das Gerät kennt den Satz.
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  -- Muss VOR der Zählung stehen, sonst zählt sich der Aufrufer bei
  -- einem gerade abgelaufenen Fenster selbst nicht als anwesend.
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
    -- Außerhalb der Arena: Einzelübung. Die Aufgabe kommt aus
    -- denselben Units, der Fortschritt läuft in dieselbe
    -- Wiedervorlage — nur passiert auf der Karte nichts.
    v_pl := wi_ensure_player(v_p.id, v_room.id, v_b.team_count);
    if v_pl.current_item is null then
      perform wi_next_task(v_p.id, v_room.id);
      select * into v_pl from wi_players where participant_id = v_p.id;
    end if;
  end if;

  select count(*) filter (where p.last_seen_at > now() - interval '90 seconds'),
         count(*)
    into v_online, v_total
    from skill_participants p where p.room_id = v_room.id;

  -- Nach Sitzplatz sortiert, damit die Reihenfolge zwischen zwei
  -- Abrufen nicht springt.
  select coalesce(jsonb_agg(jsonb_build_object(
           'name',   coalesce(p.name, 'Tablet ' || p.seat),
           'me',     p.id = v_p.id,
           'online', p.last_seen_at > now() - interval '90 seconds')
         order by p.seat), '[]'::jsonb)
    into v_my
    from wi_players w
    join skill_participants p on p.id = w.participant_id
   where w.room_id = v_room.id
     and w.team_index = v_pl.team_index
     and not p.blocked;                      -- 0152

  return jsonb_build_object(
    'ok',      true,
    'role',    'participant',
    'phase',   v_b.phase,
    'mode',    v_b.mode,
    'streak_goals', wi_streak_goals(v_b.mode),   -- 0151
    'teams',   wi_teams_json(v_room.id, v_b.team_count),
    'team_count', v_b.team_count,
    'factions',   v_b.factions,
    'map_key', v_b.room_id::text || ':' || coalesce(v_b.started_at, v_b.created_at)::text,
    'map',     case when p_full then wi_map_json(v_room.id) else null end,
    'own',     wi_own_string(v_room.id),
    'ruins',   wi_ruin_string(v_room.id),
    'hearts',  wi_heart_string(v_room.id),
    'ends_at', v_b.ends_at,
    'countdown_ends_at', v_b.countdown_ends_at,
    'winner_team',     v_b.winner_team,
    'my_team_members', v_my,
    'online_count',    v_online,
    'room_total',      v_total,
    -- 0157: Tablet erkennt Set-Änderungen der Lehrkraft daran
    'sets_changed_at', v_b.sets_changed_at,
    'me', jsonb_build_object(
            'seat',    v_p.seat,
            'name',    coalesce(v_p.name, 'Tablet ' || v_p.seat),
            'team',    v_pl.team_index,
            'streak',  v_pl.streak,
            'picks',   v_pl.picks,
            'shadow_pick', v_pl.shadow_pick,
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

comment on function wi_view(text, boolean) is
  'Teilnehmer-Ansicht von Wordisland. Seit 0146 ruins/hearts/shadow_pick, seit 0151 '
  'streak_goals, seit 0152 ein Riegel für stillgelegte Tablets (Fehler „blocked" wie in '
  'skill_view) und eine eigene Gruppe ohne sie, seit 0157 sets_changed_at. 0158 hat all '
  'das zurückgeholt, nachdem 0157 die Funktion versehentlich vom Stand 0131 aus neu '
  'geschrieben hatte.';
