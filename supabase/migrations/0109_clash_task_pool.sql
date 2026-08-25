-- ══════════════════════════════════════════════════════════════
-- Migration 0109 — Kingdoms of Mathoria: WELCHE Aufgaben kommen dran?
-- ══════════════════════════════════════════════════════════════
-- Bis hier konnte das Spiel genau eine Sache: Addition bis 100
-- (clash_new_question, 0093). Damit war es an eine Klassenstufe
-- gebunden — eine sechste Klasse rechnet dort nichts, was sie gerade
-- lernt.
--
-- Diese Migration bringt den KATALOG und die WAHL, noch nicht die
-- Aufgaben selbst. Die Aufteilung ist Absicht: hier entsteht das
-- Vokabular (welche Aufgabenarten gibt es, was kann jede) und die
-- Lobby-Bedienung; 0110 baut darauf die Fragen-Pipeline. Bis 0110
-- gelaufen ist, ändert 0109 am Spiel nichts — der Pool steht dann in
-- der Datenbank und wird noch von niemandem gelesen.
--
-- ── Zwei Ebenen, drei Zustände ─────────────────────────────────
-- Die Lehrkraft sieht Oberkategorien („Bruchrechnung") mit
-- Unterkategorien („Addieren/Subtrahieren", „Kürzen"). Jede
-- Unterkategorie hat drei Zustände:
--
--   aus       steht nicht im Pool (= Schlüssel fehlt)
--   'free'    freie Antwort, Taschenrechner zum Tippen
--   'mc'      sechs (bzw. drei) Antwortkacheln
--
-- Deshalb ist `pool` ein flaches OBJEKT und keine Liste:
-- {"frac_addsub":"free","frac_reduce":"mc"}. Eine Liste könnte den
-- Zustand nicht tragen, und ein verschachteltes Objekt je Oberkategorie
-- brächte eine zweite Wahrheit über die Zugehörigkeit — die steht schon
-- in clash_task_types.group_key.
--
-- ── Warum eine Tabelle und keine Liste im Code ─────────────────
-- Sönkes Vorgabe: „Brüche als Beispiel umsetzen und andere Kategorien
-- nachliefern." Nachliefern soll heißen: EINE Migration, kein
-- Client-Update. Deshalb sind die Aufgabenarten Referenzdaten wie
-- clash_layouts (0093) — der Beamer holt sie sich über
-- clash_task_catalog() und baut seine Tabelle daraus. Was der Client
-- über eine Aufgabenart weiß, steht damit an genau einer Stelle.
--
-- ⚠️ Der Seed benutzt `on conflict (key) DO UPDATE`, nicht `do nothing`.
-- Eine Korrektur an einer schon gelaufenen Migration käme mit
-- `do nothing` nie in der Datenbank an (Regel:
-- feedback_stale_reference_data_do_nothing) — und an Labels und
-- Beispielen wird erfahrungsgemäß noch gefeilt.
--
-- ⚠️ Neu deklariert werden clash_room_get und clash_sig_of, beide auf
-- Grundlage der HÖCHSTEN bestehenden Fassung (0108), sonst fielen deren
-- Zusätze wieder weg (Regel: feedback_shop_state_merge_regressions).
--
-- Kein DROP — DO-Block mit pg_catalog-Abfrage und `create or replace`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_task_types — der Katalog
-- ─────────────────────────────────────────────────────────────
-- Reine Referenzdaten, nie zur Laufzeit verändert, kein Bezug zu einem
-- Raum. Genau wie clash_layouts: RLS an, keine Policies, nur
-- service_role darf lesen — der Client kommt über clash_task_catalog()
-- heran und hat keinen Grund, die Tabelle selbst abzufragen.
create table if not exists clash_task_types (
  key             text primary key,
  group_key       text    not null,
  group_label     text    not null,
  label           text    not null,
  -- Ein fertig gesetztes Beispiel für die Auswahl-Tabelle. „3/4 + 1/8"
  -- sagt der Lehrkraft in einem Blick mehr über das Niveau als jede
  -- Beschreibung, die daneben stünde.
  example         text,
  sort_group      int     not null default 0,
  sort_item       int     not null default 0,
  -- Nicht jede Aufgabenart kann beides. „Vergleichen (< = >)" hat drei
  -- mögliche Antworten — eine Tastatur dafür wäre ein viertes Layout
  -- mit drei Tasten. Die Auswahl-Tabelle blendet aus, was nicht geht,
  -- statt es anzubieten und später abzulehnen.
  allows_free     boolean not null default true,
  allows_mc       boolean not null default true,
  -- Welches TIPP-Layout diese Art braucht: 'natural' (nur Ziffern) oder
  -- 'fraction' (zusätzlich ± und a/b). Bei allows_free = false ohne
  -- Bedeutung. Siehe clash_pool_input in 0110: das Layout gilt für den
  -- ganzen RAUM, nicht für die einzelne Frage.
  input_mode      text    not null default 'natural'
                    check (input_mode in ('natural', 'fraction')),
  choice_count    int     not null default 6 check (choice_count between 2 and 8),
  -- Muss die Antwort schon vollständig gekürzt sein? Überall sonst
  -- zählt der WERT (6/8 ist als Ergebnis einer Addition dasselbe wie
  -- 3/4) — beim Kürzen ist die Endform ja die Aufgabe.
  strict_reduced  boolean not null default false
);

comment on table clash_task_types is
  'Katalog der Aufgabenarten (Referenzdaten, nie zur Laufzeit verändert). Eine neue Kategorie ist '
  'eine Zeile hier plus ein Generator in der Fragen-Pipeline — der Client muss dafür nicht angefasst '
  'werden, er baut seine Auswahl-Tabelle aus clash_task_catalog().';
comment on column clash_task_types.group_key is
  'Oberkategorie. Die Lobby gruppiert danach und bietet je Gruppe „alles an/aus" an.';
comment on column clash_task_types.input_mode is
  'Tipp-Layout dieser Art. Gilt über clash_pool_input für den ganzen Raum: sobald EINE freie '
  'Aufgabenart im Pool „fraction" verlangt, haben alle Tippaufgaben des Raums die Bruchtasten — '
  'sonst spränge die Tastatur mitten im Spiel.';
comment on column clash_task_types.strict_reduced is
  'true = die Antwort muss vollständig gekürzt sein (nur „Kürzen"). Sonst entscheidet der Wert.';

alter table clash_task_types enable row level security;
grant select on clash_task_types to service_role;

insert into clash_task_types
  (key, group_key, group_label, label, example,
   sort_group, sort_item, allows_free, allows_mc, input_mode, choice_count, strict_reduced)
values
  -- Der Bestand. Er wird hier zum ersten Eintrag eines Katalogs, statt
  -- weiter namenlos „die Aufgabe" zu sein — und bleibt die Voreinstellung
  -- (siehe clash_boards.pool), damit ein Raum ohne jede Wahl genau das
  -- Spiel ist, das es bisher gab.
  ('add100',       'basics', 'Grundrechenarten', 'Addition bis 100',
   '37 + 48',            1, 1, true,  true,  'natural',  6, false),

  ('frac_addsub',  'frac',   'Bruchrechnung',    'Addieren / Subtrahieren',
   '3/4 + 1/8',          2, 1, true,  true,  'fraction', 6, false),
  ('frac_muldiv',  'frac',   'Bruchrechnung',    'Multiplizieren / Dividieren',
   '3/5 · 5/6',          2, 2, true,  true,  'fraction', 6, false),
  ('frac_reduce',  'frac',   'Bruchrechnung',    'Kürzen',
   '12/18',              2, 3, true,  true,  'fraction', 6, true),
  -- Drei mögliche Antworten, also drei Kacheln — und keine freie
  -- Eingabe.
  ('frac_compare', 'frac',   'Bruchrechnung',    'Vergleichen (< = >)',
   '3/4 ▢ 2/3',          2, 4, false, true,  'fraction', 3, false)
on conflict (key) do update set
  group_key      = excluded.group_key,
  group_label    = excluded.group_label,
  label          = excluded.label,
  example        = excluded.example,
  sort_group     = excluded.sort_group,
  sort_item      = excluded.sort_item,
  allows_free    = excluded.allows_free,
  allows_mc      = excluded.allows_mc,
  input_mode     = excluded.input_mode,
  choice_count   = excluded.choice_count,
  strict_reduced = excluded.strict_reduced;


-- ─────────────────────────────────────────────────────────────
-- 2) clash_boards.pool — die Wahl der Lehrkraft
-- ─────────────────────────────────────────────────────────────
-- Voreinstellung ist der Bestand: Addition bis 100, frei zu tippen. Ein
-- Raum, in dem niemand etwas auswählt, spielt damit weiterhin genau das
-- Spiel von gestern.
--
-- Wie bei factions (0097) ein DO-Block statt `add column if not
-- exists`: liefe die Migration ein zweites Mal, dürfte sie die Wahl
-- einer Lehrkraft nicht mit der Voreinstellung überschreiben.
do $$
declare
  v_fresh boolean;
begin
  select not exists (
    select 1 from pg_catalog.pg_attribute
     where attrelid = 'public.clash_boards'::regclass
       and attname  = 'pool'
       and not attisdropped
  ) into v_fresh;

  if v_fresh then
    alter table clash_boards
      add column pool jsonb not null default '{"add100": "free"}'::jsonb;
  end if;
end $$;

comment on column clash_boards.pool is
  'Aufgabenpool des Raums: {Schlüssel aus clash_task_types: "free"|"mc"}. Fehlender Schlüssel = '
  'diese Aufgabenart kommt nicht dran. Nur in phase=lobby änderbar (clash_room_set_pool).';

-- Bewusst nur die grobe Form. Dass die Schlüssel im Katalog stehen und
-- die Werte zur Aufgabenart passen, prüft clash_normalize_pool — eine
-- Stelle statt zweier Regelwerke, die auseinanderlaufen können.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname  = 'clash_boards_pool_obj_ck'
       and conrelid = 'public.clash_boards'::regclass
  ) then
    alter table clash_boards
      add constraint clash_boards_pool_obj_ck
      check (jsonb_typeof(pool) = 'object' and octet_length(pool::text) <= 2048);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 3) clash_normalize_pool — die eine Stelle, die prüft
-- ─────────────────────────────────────────────────────────────
-- Zwilling von clash_normalize_factions (0097): gibt den bereinigten
-- Pool zurück oder NULL, wenn die Eingabe nichts taugt. NULL statt
-- einer Ausnahme, damit der Aufrufer sie in seine übliche
-- {ok:false,error:…}-Antwort übersetzen kann.
--
-- `stable` statt `immutable`: das Ergebnis hängt an clash_task_types.
-- Kommt dort eine Aufgabenart dazu, muss dieselbe Eingabe ein anderes
-- Ergebnis liefern dürfen.
create or replace function clash_normalize_pool(p_pool jsonb)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select case
    when p_pool is null or jsonb_typeof(p_pool) <> 'object' then null
    -- Ein einziger unbekannter Schlüssel oder ein Wert, den die
    -- Aufgabenart nicht kann, macht die ganze Eingabe ungültig: eine
    -- halb angenommene Auswahl wäre für die Lehrkraft nicht
    -- nachvollziehbar (sie sähe einen Haken, den sie nicht gesetzt hat,
    -- oder keinen, den sie gesetzt hat).
    when exists (
      select 1
        from jsonb_each_text(p_pool) e
        left join clash_task_types t on t.key = e.key
       where t.key is null
          or e.value not in ('free', 'mc')
          or (e.value = 'free' and not t.allows_free)
          or (e.value = 'mc'   and not t.allows_mc)
    ) then null
    else p_pool
  end;
$$;

revoke all on function clash_normalize_pool(jsonb) from public;

-- ⚠️ Der LEERE Pool ist hier ausdrücklich gültig. Er ist ein
-- Zwischenstand beim Umsortieren („erst alles aus, dann neu wählen"),
-- und die Lobby zeigt immer das, was gespeichert ist. Würde er hier
-- abgelehnt, spränge die Anzeige beim nächsten Takt auf die alte
-- Auswahl zurück — die Lehrkraft klickte etwas weg und es käme wieder.
-- Dass ohne Aufgaben nicht gestartet werden kann, prüft
-- clash_room_start (Fehler pool_empty), und der Startknopf sagt es
-- vorher.
comment on function clash_normalize_pool(jsonb) is
  'Prüft einen Aufgabenpool: flaches Objekt, jeder Schlüssel in clash_task_types, jeder Wert '
  '„free" oder „mc" und von der Aufgabenart erlaubt. Der leere Pool ist gültig (Zwischenstand '
  'beim Umsortieren) — die Startsperre sitzt in clash_room_start. NULL heißt „unbrauchbar" — der '
  'Aufrufer macht daraus invalid_pool.';


-- ─────────────────────────────────────────────────────────────
-- 4) clash_task_catalog — was in der Auswahl-Tabelle steht
-- ─────────────────────────────────────────────────────────────
-- Eigene RPC statt eines Anhängsels an clash_room_get: der Katalog ist
-- statisch, clash_room_get läuft im Sekundentakt. Der Beamer holt ihn
-- sich einmal, wenn die Lehrkraft die Auswahl öffnet.
--
-- Die Form ist schon die der Anzeige — Gruppen mit Einträgen, beide in
-- ihrer Reihenfolge —, damit der Client nicht selbst gruppieren und
-- sortieren muss und die Reihenfolge zwischen zwei Aufrufen nicht
-- springt.
--
-- Der Raum-Code steht im Aufruf, obwohl der Katalog für alle Räume
-- derselbe ist: die Beamer-Schicht bindet JEDE RPC an den eigenen Raum
-- (MPSkills/lib/tool.js, presenterActions) — eine Funktion ohne p_code
-- wäre von dort gar nicht erreichbar. Statt den Parameter zu
-- verschlucken, trägt er hier die übliche Zugangsprüfung: den Katalog
-- liest, wer einen eigenen Raum hat.
create or replace function clash_task_catalog(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'groups', coalesce((
      select jsonb_agg(x.g order by x.g_sort, x.g_key)
        from (
          select t.group_key as g_key,
                 min(t.sort_group) as g_sort,
                 jsonb_build_object(
                   'key',   t.group_key,
                   'label', min(t.group_label),
                   'items', jsonb_agg(
                     jsonb_build_object(
                       'key',     t.key,
                       'label',   t.label,
                       'example', t.example,
                       'free',    t.allows_free,
                       'mc',      t.allows_mc,
                       'choices', t.choice_count
                     ) order by t.sort_item, t.key)
                 ) as g
            from clash_task_types t
           group by t.group_key
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function clash_task_catalog(text) from public;
grant execute on function clash_task_catalog(text) to authenticated;

comment on function clash_task_catalog(text) is
  'Der Aufgaben-Katalog für die Auswahl-Tabelle in der Lobby, fertig gruppiert und sortiert. '
  'Statisch — einmal beim Öffnen der Auswahl holen, nicht im Poll-Takt. p_code ist nur die '
  'Zugangsprüfung (die Beamer-Schicht hängt ihn ohnehin an jede RPC).';


-- ─────────────────────────────────────────────────────────────
-- 5) clash_room_set_pool — die Lobby-Bedienung
-- ─────────────────────────────────────────────────────────────
-- Nach dem Muster von clash_room_set_factions (0097): nur die eigene
-- Lehrkraft, nur in der Lobby. Sönkes Entscheidung ist ausdrücklich,
-- den Pool NICHT im laufenden Spiel ändern zu lassen — sonst könnte
-- eine Aufgabe mitten in der Runde ihre Art und damit die Tastatur
-- wechseln.
--
-- Gibt den gespeicherten Pool zurück, damit der Client mit dem
-- weiterarbeitet, was tatsächlich in der Datenbank steht, statt es
-- nachzubilden.
create or replace function clash_room_set_pool(p_code text, p_pool jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
  v_norm  jsonb;
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

  if v_board.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  v_norm := clash_normalize_pool(p_pool);
  if v_norm is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_pool');
  end if;

  update clash_boards set pool = v_norm where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true, 'pool', v_norm);
end;
$$;

revoke all on function clash_room_set_pool(text, jsonb) from public;
grant execute on function clash_room_set_pool(text, jsonb) to authenticated;

comment on function clash_room_set_pool(text, jsonb) is
  'Setzt den Aufgabenpool des Raums. Nur in phase=lobby — im laufenden Spiel dürfte eine Aufgabe '
  'sonst mitten in der Runde ihre Art und damit die Tastatur wechseln.';


-- ─────────────────────────────────────────────────────────────
-- 6) clash_room_get — `pool` für die Lobby
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0108. Eine Zeile mehr in der Rückgabe. Der Beamer braucht
-- sie, damit die Zusammenfassung („Aufgaben: Bruchrechnung — Kürzen")
-- nach einem Neuladen noch stimmt und nicht aus einer lokalen Kopie
-- kommt, die niemand nachführt.
--
-- clash_view (Tablet) bekommt den Pool bewusst NICHT: das Kind sieht
-- seine Aufgabe, nicht den Vorrat, aus dem sie gezogen wurde. Was es
-- fürs Layout wissen muss, steht an der Frage selbst (question.input).
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
  v_events jsonb := '[]'::jsonb;
  v_ruin   jsonb := '{}'::jsonb;
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

  -- 0107: die jüngsten Serien-Ereignisse aller Völker. Aufsteigend nach
  -- id ausgeliefert (der Client vergleicht gegen die höchste bereits
  -- gezeigte), aber absteigend AUSGEWÄHLT — sonst schnitte das Limit
  -- die neuen weg statt der alten. `team` statt `team_index`, weil der
  -- Beamer-Client sie nirgends nach Slots gruppiert; er schlägt das
  -- Volk am einzelnen Eintrag nach.
  select coalesce(jsonb_agg(
           jsonb_build_object('id', e.id, 'team', e.team_index,
                              'kind', e.kind, 'payload', e.payload)
           order by e.id), '[]'::jsonb)
    into v_events
    from (
      select id, team_index, kind, payload
        from clash_team_events
       where room_id = v_room.id
       order by id desc
       limit 40
    ) e;

  -- 0108: Ruinen-Stand je Volk. Nur Völker, die schon Punkte haben —
  -- ein lebendes Volk sammelt keine, seine Null stünde nur im Weg.
  select coalesce(jsonb_object_agg(team_index,
           jsonb_build_object('points', ruin_points, 'to_next', 10 - (ruin_points % 10))),
         '{}'::jsonb)
    into v_ruin
    from clash_team_streaks
   where room_id = v_room.id and ruin_points > 0;

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'pool', v_board.pool,
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
    'team_correct_counts', v_correct,
    'team_events', v_events,
    'ruin', v_ruin,
    'board', clash_shrink_state(v_room.id)
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-Ansicht von Kingdoms of Mathoria. Seit 0096 team_members, seit 0097 factions und '
  'offline_members, seit 0099 team_correct_counts, seit 0100 Burg-Leben, seit 0107 team_events '
  'aller Völker, seit 0108 `ruin` und `board`. Seit 0109 zusätzlich `pool` — der Aufgabenpool, '
  'den die Lobby anzeigt und der einen Neuladen überleben muss.';


-- ─────────────────────────────────────────────────────────────
-- 7) clash_sig_of — Pool ins Sicherheitsnetz
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0108. Ein Term mehr. Ohne ihn bliebe eine Änderung am Pool
-- auf einem zweiten Beamer-Fenster (oder nach einem kurzen Aussetzer)
-- unsichtbar, bis irgendetwas anderes im Raum passiert — die Lobby
-- zeigte dann eine Auswahl, die nicht mehr gilt.
create or replace function clash_sig_of(p_room uuid)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select concat_ws('.',
    (select phase from clash_boards where room_id = p_room),
    (select team_count from clash_boards where room_id = p_room),
    (select factions::text from clash_boards where room_id = p_room),
    (select pool::text from clash_boards where room_id = p_room),
    (select coalesce(winner_team, -1) from clash_boards where room_id = p_room),
    (select count(*) from clash_tiles where room_id = p_room),
    (select coalesce(extract(epoch from max(updated_at))::bigint, 0)
       from clash_tiles where room_id = p_room),
    (select count(*) from skill_participants where room_id = p_room),
    (select count(*) from clash_preview_teams(p_room)),
    (select coalesce(shuffle_seed::text, '') from clash_boards where room_id = p_room),
    (select coalesce(extract(epoch from match_ends_at)::bigint, 0)
       from clash_boards where room_id = p_room),
    (select coalesce(sum(pl.correct_count), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room),
    -- 0106: Team-Serien-Vektor, Summe offener Picks, jüngstes Team-Ereignis.
    (select coalesce(string_agg(team_index::text || ':' || streak::text, ',' order by team_index), '')
       from clash_team_streaks where room_id = p_room),
    (select coalesce(sum(pl.pending_picks), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room),
    (select coalesce(max(id), 0) from clash_team_events where room_id = p_room),
    -- 0108: Ruinen-Punkte aller Völker.
    (select coalesce(sum(ruin_points), 0) from clash_team_streaks where room_id = p_room)
  );
$$;

revoke all on function clash_sig_of(uuid) from public;

comment on function clash_sig_of(uuid) is
  'Billige Änderungs-Signatur für den Poll. Seit 0106 Team-Serien-Vektor, Summe offener Picks und '
  'jüngste Team-Event-id, seit 0108 die Summe der Ruinen-Punkte, seit 0109 der Aufgabenpool — '
  'sonst bliebe eine Änderung an der Aufgabenwahl auf einem zweiten Fenster unsichtbar.';
