-- ═══════════════════════════════════════════════════════════════
-- 0128 · Kingdoms of Mathoria — Nachzügler im PvE gehören zur Klasse
-- ═══════════════════════════════════════════════════════════════
--
-- „Joint ein User während eines PvE-Spiels, wird er den Bots zugeordnet."
-- Genau so ist es, und der Grund ist eine PvP-Regel, die im PvE das
-- Gegenteil dessen tut, wofür sie gebaut wurde.
--
-- ── Wie die Balance-Regel im PvE kippt ─────────────────────────
-- clash_ensure_player (0121) steckt einen Nachzügler in das KLEINSTE
-- noch lebende Volk: Kandidaten sind alle Völker mit Kacheln
-- (owner_team >= 0), gezählt werden ihre anwesenden Spieler.
--
-- Im PvE gibt es zwei solcher Völker: Slot 0 ist die Klasse, Slot 1 der
-- Computer (0126). Slot 1 hat nie eine Zeile in clash_players — der
-- Computer besteht aus clash_ai_bots, nicht aus Teilnehmern. Seine
-- Kopfzahl ist also immer 0 und damit immer die kleinste. Nicht
-- manchmal, sondern bei JEDEM Nachzügler: `order by n.active_n` hat
-- keinen Gleichstand zu losen, wenn eine Seite konstant 0 ist.
--
-- Ein Kind, das zwei Minuten zu spät kommt, spielt seitdem für den
-- Computer — es rechnet, erobert Felder für den Gegner, taucht in der
-- Klassenliste nicht auf, und auf dem Beamer steht seine Serie unter
-- dem Volk, gegen das die Klasse spielt.
--
-- ── Die Regel gilt nur im PvP ──────────────────────────────────
-- Im PvE ist nichts abzuwägen: es gibt genau ein Volk für Menschen.
-- Also kein „bevorzugt Slot 0", sondern Slot 0, Punkt. Die
-- Kopfzahl-Auslosung von 0121 bleibt Wort für Wort stehen und gilt
-- weiterhin für den PvP — dort ist sie richtig.
--
-- Damit steht clash_ensure_player auf derselben Fallunterscheidung wie
-- clash_preview_teams (0126:958): dort `case when b.mode = 'pve'
-- then 0`, hier dasselbe für den Spätzugang. Start und Nachzug ordnen
-- wieder nach derselben Regel zu — genau das war schon der Anspruch von
-- 0121, nur eben ohne den PvE-Fall.
--
-- ── Und ein Bot dazu, damit die Waage stimmt ───────────────────
-- Der Gegner besteht aus so vielen Bots, wie Kinder im Klassen-Volk
-- sind (0126). Das gleicht clash_ai_tick bei jedem Takt an — der neue
-- Bot käme also von selbst. Nur eben einen Poll zu spät: in clash_view
-- läuft der Takt VOR clash_ensure_player (0126:1787 gegen 0126:1814),
-- weil die Ansicht den Stand zeigen soll, den sie selbst erzeugt hat.
-- Beim ersten Poll des Nachzüglers gibt es seine Zeile also noch nicht,
-- gezählt wird er erst beim zweiten.
--
-- Eine Sekunde Ungleichgewicht ist keine Katastrophe, aber sie ist auch
-- nicht nötig: die Zeile, die das Kind anlegt, ist die Stelle, an der
-- der Gegenspieler entsteht. Dafür wandert die Angleichung aus
-- clash_ai_tick in ein eigenes clash_ai_sync_bots, das beide rufen —
-- eine Regel, ein Ort. Ein zweiter Aufruf kostet nichts: die Funktion
-- ist idempotent (`generate_series` + `on conflict do nothing`, dann
-- `delete … bot_no > n`).
--
-- Der frische Bot startet mit next_at = jetzt + einem vollen Takt, wie
-- in 0126. Er zieht also nicht sofort — das Kind hat seine erste
-- Aufgabe schließlich auch noch nicht gelesen.
--
-- Umgekehrt gilt dieselbe Angleichung schon immer: verlässt ein Kind
-- die Runde (oder ist 90 s nicht mehr gesehen worden), fällt beim
-- nächsten Takt ein Bot weg. Das war nie das Problem und bleibt.
--
-- ── Die schon verteilten Kinder ────────────────────────────────
-- Eine laufende Partie repariert sich nicht von selbst: der frühe
-- Ausstieg `if exists (select 1 from clash_players …)` ist der
-- Wiedererkennungs-Mechanismus für kurze Aussetzer und lässt eine
-- bestehende Zeile in Ruhe — auch eine falsche. Deshalb einmalig ein
-- update, das im PvE alle menschlichen Zeilen auf Slot 0 zieht. Serien
-- und Zähler bleiben stehen; das Kind hat ja gerechnet, nur für die
-- falsche Seite.
--
-- ⚠️ Neu deklariert werden clash_ensure_player (0121) und clash_ai_tick
-- (0127) — jeweils die HÖCHSTE bestehende Fassung (Regel:
-- feedback_shop_state_merge_regressions).
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
--
-- Client-Anpassung: nein ⇒ kein Cache-Stempel.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_ai_sync_bots — so viele Bots wie Kinder, an einem Ort
-- ─────────────────────────────────────────────────────────────
-- Wörtlich der Block, der bis 0127 in clash_ai_tick stand, plus den
-- Vorbedingungen, die dort schon oben geprüft waren (Modus, Phase) —
-- die braucht es hier noch einmal, weil clash_ensure_player ungeprüft
-- hereinkommt. Im PvP und außerhalb von `running` passiert nichts.
--
-- Der Takt eines frischen Bots wird aus derselben Rechnung gebildet wie
-- in clash_ai_tick: die beim Start eingefrorene Richtzeit des Pools mal
-- dem Zeitfaktor der aktuellen Ramp-Stufe. Kein zweiter Regler — die
-- Zahlen kommen aus clash_ai_levels wie überall sonst auch.
--
-- Rückgabe ist die Zahl der Bots (= die der gezählten Kinder). Niemand
-- muss sie auswerten; sie macht die Funktion in der Konsole prüfbar,
-- ohne dass man clash_ai_bots selbst zählen muss.
create or replace function clash_ai_sync_bots(p_room uuid)
  returns int
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_board  clash_boards;
  v_factor numeric;
  v_beat   double precision;
  v_kids   int;
begin
  select * into v_board from clash_boards where room_id = p_room;
  if v_board.room_id is null then return 0; end if;
  if v_board.mode <> 'pve' or v_board.phase <> 'running' then return 0; end if;

  v_factor := (clash_ai_levels()->'time_factor'->>(coalesce(v_board.ai_stage, 1) - 1))::numeric;
  v_beat   := greatest(coalesce(v_board.ai_pace_secs, 10) * coalesce(v_factor, 2), 1)::double precision;

  -- Dieselbe Anwesenheitsgrenze wie 0079/0113/0121. Mindestens einer,
  -- damit eine Partie nicht stillsteht, während gerade alle Tablets im
  -- Sperrbildschirm sind.
  select count(*)::int into v_kids
    from clash_players pl
    join skill_participants p on p.id = pl.participant_id
   where p.room_id = p_room
     and pl.team_index = 0
     and p.left_at is null
     and not p.blocked
     and p.last_seen_at > now() - interval '90 seconds';
  v_kids := greatest(coalesce(v_kids, 0), 1);

  insert into clash_ai_bots (room_id, bot_no, next_at)
  select p_room, g, now() + make_interval(secs => v_beat)
    from generate_series(1, v_kids) g
   on conflict (room_id, bot_no) do nothing;

  delete from clash_ai_bots where room_id = p_room and bot_no > v_kids;

  return v_kids;
end;
$$;

revoke all on function clash_ai_sync_bots(uuid) from public;

comment on function clash_ai_sync_bots(uuid) is
  'Gleicht die Zahl der Bots der Zahl der anwesenden Kinder im Klassen-Volk an (0128, aus '
  'clash_ai_tick herausgelöst). Anwesend heißt left_at is null, nicht blocked, in den letzten 90 s '
  'gesehen (wie 0079/0113/0121); mindestens ein Bot. Frische Bots starten mit einem vollen Takt '
  'Vorlauf. Idempotent — clash_ai_tick ruft sie bei jedem Herzschlag, clash_ensure_player beim '
  'Spätzugang, damit der Gegenspieler nicht einen Poll später entsteht. Steigt im PvP und '
  'außerhalb von phase=running sofort mit 0 aus.';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_ai_tick — derselbe Takt, die Angleichung ausgelagert
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0127, Wort für Wort. Geändert ist genau eine Stelle: der
-- Zähl-und-Anlege-Block wird zu `perform clash_ai_sync_bots(p_room)`,
-- die damit unbenutzte Variable v_kids fällt weg. Ramp, Sperre,
-- Aufhol-Deckel, Serie und Sieg-Prüfung stehen unverändert.
create or replace function clash_ai_tick(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_board   clash_boards;
  v_lv      jsonb := clash_ai_levels();
  v_var     double precision;
  v_stage   int;
  v_factor  numeric;
  v_quote   double precision;
  v_beat    double precision;
  v_castles int;
  v_goal    int;
  v_reward  int;
  v_bot     record;
  v_next    timestamptz;
  v_streak  int;
  v_correct int;
  v_moves   int;
  j         int;
begin
  select * into v_board from clash_boards where room_id = p_room;
  if v_board.room_id is null then return; end if;
  if v_board.mode <> 'pve' or v_board.phase <> 'running' then return; end if;

  -- Billiger Vorabtest, bevor überhaupt um die Sperre gebeten wird.
  if v_board.ai_ticked_at is not null
     and v_board.ai_ticked_at > now() - interval '500 milliseconds' then
    return;
  end if;

  if not pg_try_advisory_xact_lock(hashtext(p_room::text)) then
    return;
  end if;

  -- Zweite Lesung NACH der Sperre: wer sie eben noch hielt, hat
  -- inzwischen festgeschrieben, und in READ COMMITTED sieht dieses
  -- frische SELECT dessen ai_ticked_at. Ohne die Wiederholung liefe der
  -- Takt bei zwei fast gleichzeitigen Anfragen doppelt.
  select * into v_board from clash_boards where room_id = p_room;
  if v_board.mode <> 'pve' or v_board.phase <> 'running' then return; end if;
  if v_board.ai_ticked_at is not null
     and v_board.ai_ticked_at > now() - interval '500 milliseconds' then
    return;
  end if;

  -- ── Die Ramp ────────────────────────────────────────────────
  -- Unverändert seit 0126: eine Burg, eine Stufe, und greatest(…,
  -- ai_stage) ist die Ratsche — eine zurückeroberte Burg senkt die
  -- Stufe nicht wieder. Seit 0127 ist das ein echter Anstieg, weil ihr
  -- Gegengewicht (die alte Rüstung) nicht mehr mitwächst.
  select count(*)::int into v_castles
    from clash_tiles where room_id = p_room and owner_team = 0 and is_castle;

  v_stage := least(v_board.ai_level, greatest(v_board.ai_stage, greatest(v_castles, 1)));
  if v_stage <> v_board.ai_stage then
    update clash_boards set ai_stage = v_stage where room_id = p_room;
  end if;

  v_factor := (v_lv->'time_factor'->>(v_stage - 1))::numeric;
  v_quote  := (v_lv->'quote'->>(v_stage - 1))::double precision;
  v_var    := coalesce((v_lv->>'variance')::double precision, 0.1);
  v_goal   := greatest(coalesce((v_lv->>'bot_streak')::int, 4), 1);
  v_reward := greatest(coalesce((v_lv->>'bot_reward')::int, 2), 0);

  v_beat := greatest(coalesce(v_board.ai_pace_secs, 10) * coalesce(v_factor, 2), 1)::double precision;

  -- ── So viele Bots wie Kinder ────────────────────────────────
  -- Seit 0128 in clash_ai_sync_bots, weil der Spätzugang dieselbe
  -- Angleichung braucht — und zwar sofort und nicht erst beim nächsten
  -- Takt. Der Aufruf steht bewusst NACH der Ramp: ein frischer Bot soll
  -- den Takt der aktuellen Stufe bekommen, nicht den der vorigen.
  perform clash_ai_sync_bots(p_room);

  -- ── Die fälligen Bots ───────────────────────────────────────
  for v_bot in
    select * from clash_ai_bots
     where room_id = p_room and next_at <= now()
     order by bot_no
       for update skip locked
  loop
    v_next    := v_bot.next_at;
    v_streak  := v_bot.streak;
    v_correct := v_bot.correct_count;

    -- Aufholen begrenzen. Wenn ein Raum eine Minute lang niemanden
    -- hatte, der pollt (Pause, Netz weg), stünden sonst zwölf Züge je
    -- Bot an und das halbe Feld fiele in einem einzigen Takt. Der
    -- Rückstand verfällt bewusst: der Computer spielt weiter, er holt
    -- nicht nach.
    if v_next < now() - make_interval(secs => v_beat * 3) then
      v_next := now() - make_interval(secs => v_beat * 0.5);
    end if;

    v_moves := 0;
    while v_next <= now() and v_moves < 2 loop
      if random() < v_quote then
        perform clash_ai_strike(p_room);
        v_streak  := v_streak + 1;
        v_correct := v_correct + 1;

        -- Die Serie des Bots — seit 0127 bei 4, dieselbe Schwelle wie
        -- die Einzel-Serie eines Kindes (clash_streak_goals.solo), nur
        -- ohne Auswahl: der Computer sucht sich nichts aus, er nimmt.
        if v_streak % v_goal = 0 then
          for j in 1 .. v_reward loop
            perform clash_ai_strike(p_room);
          end loop;
          perform clash_team_event_insert(p_room, 1, 'individual_fire',
            jsonb_build_object('name', 'Bot ' || v_bot.bot_no, 'streak', v_streak));
        end if;
      else
        v_streak := 0;
      end if;

      v_moves := v_moves + 1;
      -- ±variance je EINZELNEM Zug, nicht je Bot: sonst wäre ein Bot
      -- dauerhaft der schnelle und einer dauerhaft der lahme, und das
      -- Muster auf dem Feld wiederholte sich.
      v_next := v_next + make_interval(
        secs => v_beat * (1 - v_var + random() * 2 * v_var));
    end loop;

    update clash_ai_bots
       set next_at = v_next, streak = v_streak, correct_count = v_correct
     where room_id = p_room and bot_no = v_bot.bot_no;
  end loop;

  perform clash_check_win(p_room);

  update clash_boards set ai_ticked_at = now() where room_id = p_room;
end;
$$;

revoke all on function clash_ai_tick(uuid) from public;

comment on function clash_ai_tick(uuid) is
  'Der Takt des Computer-Gegners (0126, in 0127 auf clash_ai_strike umgestellt). Kein Cron: läuft '
  'lazy aus clash_submit/clash_view/clash_room_get, höchstens alle 500 ms und durch '
  'pg_try_advisory_xact_lock nie doppelt. Führt die Ramp (ai_stage) nach, gleicht die Bot-Zahl den '
  'anwesenden Kindern an (seit 0128 über clash_ai_sync_bots) und lässt jeden fälligen Bot bis zu '
  'zwei Züge machen. Steigt im PvP auf der ersten Zeile aus.';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_ensure_player — im PvE gehört jeder Nachzügler zur Klasse
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0121. Die Kopfzahl-Auslosung bleibt Wort für Wort stehen
-- und gilt weiterhin für den PvP; davor steht nur die
-- Fallunterscheidung, die clash_preview_teams seit 0126 schon zieht.
--
-- Warum im PvE kein `if v_team is null then return`: dort gibt es
-- nichts zu prüfen. Selbst wenn das Klassen-Volk gerade kein Feld mehr
-- besitzt, ist es das Volk des Kindes — es bekommt seine Zeile, sieht
-- den Spielstand seiner Klasse und deren Ende, statt gar nicht zu
-- existieren. Im PvP ist der Rückzieher dagegen richtig: dort hieße
-- „kein Kandidat", dass alle Völker gefallen sind.
create or replace function clash_ensure_player(p_participant uuid, p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_phase text;
  v_mode  text;
  v_pool  jsonb;
  v_team  int;
begin
  if exists (select 1 from clash_players where participant_id = p_participant) then
    return;
  end if;

  select phase, mode, pool into v_phase, v_mode, v_pool
    from clash_boards where room_id = p_room;
  if v_phase is null or v_phase = 'lobby' then
    return;
  end if;

  if v_mode = 'pve' then
    -- Slot 0 ist die Klasse, Slot 1 der Computer (0126). Es gibt nichts
    -- auszuwählen.
    v_team := 0;
  else
    -- Kandidaten sind die Völker, die noch Kacheln besitzen (kein
    -- eliminated-Flag, siehe Kopfkommentar von 0093) — neutrale Felder
    -- ausgenommen. Je Kandidat einmal die Kopfzahl; die Reihenfolge
    -- entscheidet, der Zufall nur noch bei Gleichstand.
    select cand.team into v_team
      from (
        select distinct owner_team as team
          from clash_tiles
         where room_id = p_room
           and owner_team >= 0
      ) cand
      cross join lateral (
        select
          count(*) filter (
            where sp.left_at is null
              and not sp.blocked
              and sp.last_seen_at > now() - interval '90 seconds'
          )::int as active_n,
          count(*)::int as total_n
          from clash_players cp
          join skill_participants sp on sp.id = cp.participant_id
         where sp.room_id  = p_room
           and cp.team_index = cand.team
      ) n
     order by n.active_n, n.total_n, random()
     limit 1;

    if v_team is null then
      return;
    end if;
  end if;

  insert into clash_players (participant_id, team_index, current_q)
  values (p_participant, v_team, clash_new_question(v_pool))
  on conflict (participant_id) do nothing;

  -- Ein Kind mehr im Klassen-Volk heißt ein Bot mehr im Volk des
  -- Computers — sofort, nicht erst beim nächsten Takt (in clash_view
  -- läuft der vor dieser Funktion). Idempotent, und im nicht laufenden
  -- Spiel ein No-op.
  if v_mode = 'pve' then
    perform clash_ai_sync_bots(p_room);
  end if;
end;
$$;

revoke all on function clash_ensure_player(uuid, uuid) from public;

comment on function clash_ensure_player(uuid, uuid) is
  'Legt eine clash_players-Zeile nur an, wenn noch keine existiert (das ist der Wiedererkennungs-'
  'Mechanismus für kurze Aussetzer). Im PvE kommt jeder Neuzugang seit 0128 in das Volk der Klasse '
  '(Slot 0) und zieht über clash_ai_sync_bots sofort einen weiteren Bot nach sich — bis 0127 fiel '
  'er der Balance-Regel zum Opfer und spielte für den Computer, dessen Kopfzahl immer 0 ist. Im '
  'PvP gilt unverändert 0121: das KLEINSTE noch lebende Volk, gezählt werden anwesende Spieler '
  '(left_at is null, nicht blocked, 90 s wie 0079), bei Gleichstand entscheidet die Gesamtzahl der '
  'Zugeordneten, erst danach der Zufall; neutrale Kacheln (owner_team = -1, 0105) sind kein Volk. '
  'NICHT die Sitzplatz-Formel — die gilt nur für den Start. Aufgabe aus dem Pool des Raums (0110).';


-- ─────────────────────────────────────────────────────────────
-- 4) Einmalige Reparatur: Kinder aus dem Volk des Computers holen
-- ─────────────────────────────────────────────────────────────
-- Betrifft nur Räume im PvE-Modus; im PvP ist ein team_index <> 0 der
-- Normalfall und wird nicht angefasst. Läuft ein zweites Mal ins Leere
-- (nach dem ersten Durchgang gibt es keine solche Zeile mehr), und ein
-- Raum in der Lobby merkt ohnehin nichts davon: clash_room_start löscht
-- die clash_players-Zeilen und verteilt neu.
--
-- Ein Kind kann durch dieses update mitten in der Partie das Volk
-- wechseln — mit seinen Zählern und seiner Serie. Das ist gewollt: es
-- hat gerechnet, nur für die falsche Seite.
update clash_players cp
   set team_index = 0
  from skill_participants p
  join clash_boards b on b.room_id = p.room_id
 where cp.participant_id = p.id
   and b.mode = 'pve'
   and cp.team_index <> 0;
