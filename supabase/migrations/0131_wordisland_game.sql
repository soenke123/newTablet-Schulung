-- ══════════════════════════════════════════════════════════════
-- Migration 0131 — Myth of Wordisland: die Insel
-- ══════════════════════════════════════════════════════════════
-- Sechster Skill, zweites Team-Spiel. Der Inhalt kommt aus 0130
-- (vocab_*), hier steht nur, was mit einer richtigen Vokabel auf
-- der Karte passiert.
--
-- ── Das Spiel in fünf Sätzen ──────────────────────────────────
-- 2–6 Völker landen mit ihren Schiffen rundum an einer
-- vernebelten Insel. Eine richtige Vokabel lüftet ein zufälliges
-- Nachbarfeld — Nebel zuerst, und wenn am eigenen Rand keiner mehr
-- ist, nimmt sie einem anderen Volk Land ab. Wer drei richtige in
-- Folge hat, wählt selbst, welches Feld fällt, und steuert damit
-- auf die Lichtpunkte zu, die von Anfang an durch den Nebel
-- schimmern. Dort liegen Ruinen; sie zählen extra, sind zur
-- Inselmitte hin wertvoller und wechseln mit dem Feld den Besitzer.
-- Der Landeplatz bleibt unantastbar — kein Volk fällt aus dem
-- Spiel.
--
-- ── Warum die Insel HIER gewürfelt wird ───────────────────────
-- Kingdoms of Mathoria hat seine sieben Layouts einmalig offline
-- erzeugt und in clash_layouts abgelegt: dort ist das Board für
-- eine Team-Zahl immer dasselbe, und das ist richtig, weil es ein
-- Kampf um Symmetrie ist. Hier ist es umgekehrt — eine Insel, die
-- immer gleich aussieht, deckt man genau einmal gern auf. Also
-- wird sie je Raum erzeugt.
--
-- Der Umriss ist keine Zufallswolke, sondern eine STERNFÖRMIGE
-- Fläche: der Küstenabstand ist eine Funktion des Winkels (drei
-- übereinandergelegte Wellen mit zufälliger Phase). Das sieht
-- organisch aus und hat eine Eigenschaft, die man sonst mühsam
-- prüfen müsste — so eine Fläche ist IMMER zusammenhängend. Kein
-- abgetrenntes Nebelfeld, das niemand erreichen kann, keine
-- Flutfüllung zur Kontrolle.
--
-- ── Größe ─────────────────────────────────────────────────────
-- Aus Teilnehmerzahl und Spieldauer, bewusst knapper als „bis zum
-- Schluss reicht der Nebel": wenn die Insel offen ist, hört das
-- Spiel nicht auf, sondern fängt an. Der Faktor steht als
-- Konstante in wi_build_island und ist der Regler, an dem nach der
-- ersten echten Stunde gedreht wird.
--
-- ── Ein Feld = eine Zeile ─────────────────────────────────────
-- Wie in 0093 und aus demselben Grund: 30 Kinder, die gleichzeitig
-- antworten, wären auf einem einzigen jsonb-Feld ein serieller
-- Flaschenhals genau dann, wenn es am hektischsten ist. Die
-- Kollision zweier Teams auf demselben Feld löst die Zeile selbst
-- (bedingtes update, bei Misserfolg der nächste Kandidat).
--
-- Kein DROP — Idempotenz per `if not exists` und `on conflict`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wi_boards — ein Spiel je Raum
-- ─────────────────────────────────────────────────────────────
create table if not exists wi_boards (
  room_id           uuid primary key references skill_rooms(id) on delete cascade,
  team_count        int  not null default 4 check (team_count between 2 and 6),
  phase             text not null default 'lobby'
                      check (phase in ('lobby', 'countdown', 'running', 'ended')),
  duration_secs     int  not null default 600 check (duration_secs between 120 and 3600),
  direction         text not null default 'mixed'
                      check (direction in ('de_en', 'en_de', 'mixed')),
  mode              text not null default 'type'
                      check (mode in ('type', 'choice')),
  radius            int,
  seed              int  not null default (floor(random() * 1000000))::int,
  countdown_ends_at timestamptz,
  ends_at           timestamptz,
  started_at        timestamptz,
  ended_at          timestamptz,
  winner_team       int,
  -- Wann die Lehrkraft zuletzt am Pult war. Zwei Minuten Stille
  -- beenden die Arena: ohne sie gibt es keine Arena, und ein Spiel,
  -- das ohne Aufsicht weiterläuft, verliert nur Zeit.
  presenter_seen_at timestamptz,
  -- Eigener Zufallswert für einen Realtime-Kanal — NIE der
  -- sechsstellige Raum-Code (derselbe Trennungsgedanke wie in 0093).
  broadcast_key     text not null default encode(gen_random_bytes(18), 'hex'),
  created_at        timestamptz not null default now()
);

comment on table wi_boards is
  'Spielzustand je Raum. lobby (alles einstellbar) → countdown (Insel steht) → running → ended.';
comment on column wi_boards.mode is
  'type = tippen mit dreistufiger Prüfung, choice = nur Auswahl aus acht Wörtern.';
comment on column wi_boards.seed is
  'Nur für die Ausschmückung im Gerät (Wellen, Bäume). Die Felder selbst stehen in wi_tiles.';

alter table wi_boards enable row level security;
grant select, insert, update, delete on wi_boards to service_role;


-- ─────────────────────────────────────────────────────────────
-- 2) wi_tiles — ein Feld, eine Zeile
-- ─────────────────────────────────────────────────────────────
create table if not exists wi_tiles (
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  r          int  not null,
  c          int  not null,
  state      text not null default 'fog' check (state in ('fog', 'open')),
  owner_team int,
  is_home    boolean not null default false,
  ruin_value int  not null default 0 check (ruin_value between 0 and 3),
  dist       real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, r, c),
  -- Ein offenes Feld ohne Besitzer gibt es nicht, ein Nebelfeld mit
  -- Besitzer auch nicht. Sonst käme die Punktzählung durcheinander,
  -- und niemand fände den Fehler.
  constraint wi_tiles_owner_state check ((state = 'open') = (owner_team is not null))
);

comment on table wi_tiles is
  'Die Insel eines Raums. ruin_value > 0 = Lichtpunkt, schimmert schon durch den Nebel.';
comment on column wi_tiles.is_home is
  'Landeplatz eines Volkes. Unantastbar — es soll niemand ohne Feld dasitzen.';
comment on column wi_tiles.dist is
  'Abstand zur Inselmitte in Feldbreiten. Trägt den Ruinenwert und im Gerät die Schattierung.';

create index if not exists wi_tiles_team_idx on wi_tiles(room_id, owner_team);

alter table wi_tiles enable row level security;
grant select, insert, update, delete on wi_tiles to service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) wi_players — ein Kind
-- ─────────────────────────────────────────────────────────────
create table if not exists wi_players (
  participant_id uuid primary key references skill_participants(id) on delete cascade,
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  team_index     int  not null,
  streak         int  not null default 0,
  picks          int  not null default 0 check (picks between 0 and 3),
  correct_count  int  not null default 0,
  wrong_count    int  not null default 0,
  wrong_run      int  not null default 0,
  current_item   uuid references vocab_items(id) on delete set null,
  current_dir    text check (current_dir in ('de_en', 'en_de')),
  current_stage  text not null default 'type'
                   check (current_stage in ('type', 'spell', 'choice')),
  current_options text[] not null default '{}',
  lock_until     timestamptz
);

comment on table wi_players is
  'Volk, Serie und laufende Aufgabe je Kind. Die Lösung steht NICHT hier — sie steht in '
  'vocab_items und wird nur dort verglichen.';
comment on column wi_players.picks is
  'Freie Feldwahl aus einer Serie. Wächst mit jeder sofort richtigen Antwort ab Serie 3 und '
  'fällt mit der Serie auf 0 — wer wählen will, muss die Serie halten.';
comment on column wi_players.wrong_run is
  'Fehler in Folge. Trägt die wachsende Antwortsperre gegen schnelles Durchraten.';

create index if not exists wi_players_room_idx on wi_players(room_id, team_index);

alter table wi_players enable row level security;
grant select, insert, update, delete on wi_players to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) wi_room_sets — was in diesem Raum geübt wird
-- ─────────────────────────────────────────────────────────────
create table if not exists wi_room_sets (
  room_id uuid not null references skill_rooms(id) on delete cascade,
  set_id  uuid not null references vocab_sets(id) on delete cascade,
  primary key (room_id, set_id)
);

comment on table wi_room_sets is
  'Mehrere Units gleichzeitig sind erlaubt — Wiederholung über zwei Themen ist der Normalfall.';

alter table wi_room_sets enable row level security;
grant select, insert, update, delete on wi_room_sets to service_role;


-- ─────────────────────────────────────────────────────────────
-- 5) Geometrie
-- ─────────────────────────────────────────────────────────────
-- Dieselbe Hex-Nachbarschaft wie in Kingdoms (clash_is_neighbor,
-- 0093): versetzte Reihen, ungerade Zeile nach rechts. Eigene
-- Funktion statt Aufruf der fremden — ein Werkzeug, das eine
-- Funktion eines anderen Spiels braucht, kann ohne dieses nicht
-- mehr ausgeliefert werden.
create or replace function wi_is_neighbor(p_r1 int, p_c1 int, p_r2 int, p_c2 int)
  returns boolean
  immutable
  set search_path = public
  language sql
as $$
  select case when p_r1 % 2 = 1 then
    (p_r2, p_c2) in ((p_r1-1, p_c1), (p_r1-1, p_c1+1), (p_r1, p_c1-1),
                     (p_r1, p_c1+1), (p_r1+1, p_c1),   (p_r1+1, p_c1+1))
  else
    (p_r2, p_c2) in ((p_r1-1, p_c1-1), (p_r1-1, p_c1), (p_r1, p_c1-1),
                     (p_r1, p_c1+1),   (p_r1+1, p_c1-1), (p_r1+1, p_c1))
  end;
$$;

-- Die sechs Nachbarn eines Feldes als Zeilen. Damit lässt sich der
-- Rand eines Volkes über den Primärschlüssel finden, statt für
-- jedes Feldpaar wi_is_neighbor aufzurufen — bei 500 Feldern ist
-- das der Unterschied zwischen einem Index-Zugriff und 250.000
-- Funktionsaufrufen.
create or replace function wi_neighbors(p_r int, p_c int)
  returns table (r int, c int)
  immutable
  set search_path = public
  language sql
as $$
  select * from (values
    (p_r - 1, p_c + case when p_r % 2 = 1 then 0 else -1 end),
    (p_r - 1, p_c + case when p_r % 2 = 1 then 1 else  0 end),
    (p_r,     p_c - 1),
    (p_r,     p_c + 1),
    (p_r + 1, p_c + case when p_r % 2 = 1 then 0 else -1 end),
    (p_r + 1, p_c + case when p_r % 2 = 1 then 1 else  0 end)
  ) as n(r, c);
$$;


-- ─────────────────────────────────────────────────────────────
-- 6) wi_build_island — die Insel entsteht
-- ─────────────────────────────────────────────────────────────
create or replace function wi_build_island(p_room uuid, p_teams int, p_people int, p_secs int)
  returns int
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  -- Wie viele Felder die Runde vertragen soll. 1.6 Felder je Kind
  -- und Minute: ein Kind schafft in der Minute etwa vier Antworten,
  -- also ist nach rund 40 % der Zeit der Nebel weg und der Rest der
  -- Stunde gehört dem Streit um die Ruinen. Genau dieser Faktor ist
  -- der Regler für die erste echte Stunde.
  c_per_kid  constant real := 1.6;
  -- Aus dem Umriss folgt empirisch: Felder ≈ 1.78 · R².
  c_area     constant real := 1.78;
  v_target int;
  v_R      int;
  v_rows   int;
  v_cols   int;
  v_cx     real;
  v_cy     real;
  v_p1     real := random() * 6.2832;
  v_p2     real := random() * 6.2832;
  v_p3     real := random() * 6.2832;
  v_n      int;
  v_ruins  int;
  v_min    real;
  i        int;
  k        int;
  v_ang    real;
  v_home   record;
  v_try    record;
begin
  delete from wi_tiles where room_id = p_room;

  v_target := greatest(80, least(900,
                (greatest(p_people, 4) * c_per_kid * (p_secs / 60.0))::int));
  v_R      := greatest(6, least(20, ceil(sqrt(v_target / c_area))::int));
  v_cols   := 2 * v_R + 2;
  v_rows   := ceil(2 * v_R / 0.8660254)::int + 1;
  v_cx     := v_R + 0.5;
  v_cy     := (v_rows - 1) / 2.0;

  -- Der Umriss: Küstenabstand als Funktion des Winkels. Drei Wellen
  -- übereinander ergeben Buchten und Landzungen, ohne dass die
  -- Fläche je zerfällt.
  insert into wi_tiles (room_id, r, c, state, dist)
  select p_room, g.r, g.c, 'fog', g.d
    from (
      select rr as r, cc as c,
             sqrt(power(cc + 0.5 * (rr % 2) - v_cx, 2)
                + power((rr - v_cy) * 0.8660254, 2)) as d,
             atan2((rr - v_cy) * 0.8660254, cc + 0.5 * (rr % 2) - v_cx) as a
        from generate_series(0, v_rows - 1) as rr,
             generate_series(0, v_cols - 1) as cc
    ) g
   where g.d <= v_R * (0.70 + 0.13 * sin(g.a + v_p1)
                            + 0.09 * sin(2 * g.a + v_p2)
                            + 0.05 * sin(3 * g.a + v_p3));

  select count(*) into v_n from wi_tiles where room_id = p_room;

  -- Die Landeplätze: für jedes Volk eine Richtung, und darin das
  -- Küstenfeld, dessen WINKEL am besten passt.
  --
  -- Der erste Versuch nahm das in dieser Richtung am weitesten außen
  -- liegende Feld. Das klingt richtig und ist es nicht: läuft die
  -- Küste in eine große Landzunge aus, ziehen zwei benachbarte
  -- Richtungen auf dieselbe Nase, und zwei Völker starten
  -- nebeneinander, während die halbe Insel leer bleibt. Im
  -- Prüfstand kam das in jedem vierten Lauf vor.
  --
  -- Nach dem Winkel zu wählen macht genau das unmöglich: die
  -- Zielrichtungen sind gleichmäßig verteilt, und jedes Volk landet
  -- so nah an seiner, wie die Küste es zulässt. Der Mindestabstand
  -- bleibt als zweiter Riegel — die Sehne zwischen zwei gleichmäßig
  -- verteilten Punkten mit etwas Nachlass, damit auch eine schmale
  -- Insel eine Lösung hat.
  v_min := 1.10 * v_R * sin(pi() / p_teams);

  for k in 0 .. p_teams - 1 loop
    v_ang := 6.2832 * k / p_teams + v_p1;

    for i in 1 .. 2 loop
      select t.r, t.c into v_home
        from wi_tiles t
        cross join lateral (select (t.c + 0.5 * (t.r % 2) - v_cx) as x,
                                   ((t.r - v_cy) * 0.8660254)     as y) g
       where t.room_id = p_room
         and not t.is_home
         -- Nur die Küste: mindestens ein Nachbar ist Wasser.
         and exists (select 1 from wi_neighbors(t.r, t.c) n
                      where not exists (select 1 from wi_tiles w
                                         where w.room_id = p_room
                                           and w.r = n.r and w.c = n.c))
         -- Erster Durchgang mit Abstand, zweiter ohne: lieber ein
         -- enger Nachbar als gar kein Landeplatz.
         and (i = 2 or not exists (
               select 1 from wi_tiles h
                where h.room_id = p_room and h.is_home
                  and sqrt(power((h.c + 0.5 * (h.r % 2)) - (t.c + 0.5 * (t.r % 2)), 2)
                         + power((h.r - t.r) * 0.8660254, 2)) < v_min))
       -- Winkelabstand über atan2(sin Δ, cos Δ): so ist 350° zu 10°
       -- ein Abstand von 20 und nicht von 340.
       order by abs(atan2(sin(atan2(g.y, g.x) - v_ang),
                          cos(atan2(g.y, g.x) - v_ang)))
       limit 1;
      exit when v_home.r is not null;
    end loop;

    update wi_tiles
       set is_home = true, state = 'open', owner_team = k
     where room_id = p_room and r = v_home.r and c = v_home.c;
  end loop;

  -- Die Lichtpunkte. Ein Vierzigstel der Felder, mit Mindestabstand
  -- gestreut: „gleichmäßig verteilt, in der Mitte wertvoller".
  -- Ohne den Abstand liegen bei Zufall regelmäßig drei Ruinen
  -- nebeneinander, und dann entscheidet eine einzige Ecke das Spiel.
  v_ruins := greatest(6, least(30, (v_n / 40.0)::int));
  for i in 1 .. v_ruins loop
    select t.r, t.c, t.dist into v_try
      from wi_tiles t
     where t.room_id = p_room
       and not t.is_home
       and t.ruin_value = 0
       and not exists (
             select 1 from wi_tiles s
              where s.room_id = p_room
                and s.ruin_value > 0
                and sqrt(power((s.c + 0.5 * (s.r % 2)) - (t.c + 0.5 * (t.r % 2)), 2)
                       + power((s.r - t.r) * 0.8660254, 2)) < 3.0)
     order by random()
     limit 1;

    exit when v_try.r is null;

    update wi_tiles
       set ruin_value = case when v_try.dist < 0.30 * v_R then 3
                             when v_try.dist < 0.62 * v_R then 2
                             else 1 end
     where room_id = p_room and r = v_try.r and c = v_try.c;
  end loop;

  update wi_boards set radius = v_R where room_id = p_room;
  return v_n;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 7) Board und Spieler, beide lazy
-- ─────────────────────────────────────────────────────────────
-- Ein Raum bekommt sein Board beim ersten Hinsehen und nicht beim
-- Anlegen: skill_room_create weiß nichts von Wordisland, und das
-- soll auch so bleiben (Regel aus 0078: ein neues Tool ist ein
-- Ordner und eine Zeile).
--
-- Die drei mitgelieferten Units sind die Voreinstellung. Ohne sie
-- stünde im Testraum, den die Landing mit einem Klick anlegt, ein
-- Spiel ohne Wörter — und das sähe nicht aus wie „noch nichts
-- gewählt", sondern wie ein Fehler.
create or replace function wi_ensure_board(p_room uuid)
  returns wi_boards
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_b wi_boards;
begin
  select * into v_b from wi_boards where room_id = p_room;
  if v_b.room_id is null then
    insert into wi_boards (room_id) values (p_room)
    on conflict (room_id) do nothing;
    select * into v_b from wi_boards where room_id = p_room;

    insert into wi_room_sets (room_id, set_id)
    select p_room, s.id from vocab_sets s where s.owner_id is null
    on conflict do nothing;
  end if;
  return v_b;
end;
$$;

-- Team-Zuordnung wie in Kingdoms: nach Sitzplatz sortiert,
-- reihum verteilt. Nachzügler bekommen dieselbe Formel mit der
-- eingefrorenen Team-Zahl — nur werden sie ins KLEINSTE Volk
-- gesetzt, nicht in das, was die Formel gerade träfe (Muster aus
-- 0121/0128): wer zu spät kommt, soll das schwächste Volk stärken
-- und nicht das stärkste.
create or replace function wi_ensure_player(p_participant uuid, p_room uuid, p_teams int)
  returns wi_players
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_p wi_players;
  v_t int;
begin
  select * into v_p from wi_players where participant_id = p_participant;
  if v_p.participant_id is not null then
    return v_p;
  end if;

  select coalesce((
    select t.team_index
      from generate_series(0, p_teams - 1) as t(team_index)
      left join wi_players w on w.room_id = p_room and w.team_index = t.team_index
     group by t.team_index
     order by count(w.participant_id), t.team_index
     limit 1
  ), 0) into v_t;

  insert into wi_players (participant_id, room_id, team_index)
  values (p_participant, p_room, v_t)
  on conflict (participant_id) do nothing;

  select * into v_p from wi_players where participant_id = p_participant;
  return v_p;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 8) Die nächste Aufgabe
-- ─────────────────────────────────────────────────────────────
create or replace function wi_next_task(p_participant uuid, p_room uuid)
  returns void
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_sets  uuid[];
  v_dir   text;
  v_mode  text;
  v_next  record;
  v_opts  text[] := '{}';
begin
  select array_agg(set_id) into v_sets from wi_room_sets where room_id = p_room;
  if v_sets is null then
    update wi_players set current_item = null where participant_id = p_participant;
    return;
  end if;

  select direction, mode into v_dir, v_mode from wi_boards where room_id = p_room;

  select * into v_next from vocab_pick_next(p_participant, v_sets, coalesce(v_dir, 'mixed'));
  if v_next.item_id is null then
    update wi_players set current_item = null where participant_id = p_participant;
    return;
  end if;

  -- Im reinen Auswahl-Modus steht die Auswahl schon in der Aufgabe;
  -- getippt wird gar nicht erst.
  if v_mode = 'choice' then
    v_opts := vocab_choices(v_sets, v_next.item_id, v_next.dir, 8);
  end if;

  update wi_players
     set current_item    = v_next.item_id,
         current_dir     = v_next.dir,
         current_stage   = case when v_mode = 'choice' then 'choice' else 'type' end,
         current_options = v_opts
   where participant_id = p_participant;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 9) Ein Feld nehmen
-- ─────────────────────────────────────────────────────────────
-- Der Rand eines Volkes: alle Felder, die an eines seiner Felder
-- grenzen. `p_kind` entscheidet, ob Nebel oder fremdes Land
-- gesucht wird.
--
-- Die vier Sekunden Sperre sind gegen das Ping-Pong: ohne sie
-- wechseln in der Schlussphase dieselben zwei Felder im
-- Sekundentakt hin und her, und am Beamer flackert es nur noch.
create or replace function wi_border(p_room uuid, p_team int, p_kind text)
  returns table (r int, c int)
  volatile
  set search_path = public
  language sql
as $$
  select t.r, t.c
    from (
      select distinct n.r, n.c
        from wi_tiles m
        cross join lateral wi_neighbors(m.r, m.c) n
       where m.room_id = p_room and m.owner_team = p_team
    ) nb
    join wi_tiles t on t.room_id = p_room and t.r = nb.r and t.c = nb.c
   where case when p_kind = 'fog'
              then t.state = 'fog'
              else t.state = 'open'
                   and t.owner_team is distinct from p_team
                   and not t.is_home
                   and t.updated_at < now() - interval '4 seconds'
         end
   order by random()
   limit 6;
$$;

-- Nimmt ein Feld für das Volk. Erst Nebel, dann fremdes Land —
-- „Nebel zuerst" ist die Regel, an der das Spiel hängt: solange es
-- etwas zu entdecken gibt, wird entdeckt.
--
-- Bei einer Kollision (zwei Völker greifen im selben Moment nach
-- demselben Feld) gewinnt die Zeile, nicht die Anwendung: das
-- update trägt seine Bedingung mit, und wer leer ausgeht, nimmt
-- den nächsten Kandidaten.
create or replace function wi_take_tile(p_room uuid, p_team int)
  returns jsonb
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_kind text;
  v_cand record;
  v_hit  int;
begin
  foreach v_kind in array array['fog', 'enemy'] loop
    for v_cand in select * from wi_border(p_room, p_team, v_kind) loop
      update wi_tiles t
         set owner_team = p_team,
             state      = 'open',
             updated_at = now()
       where t.room_id = p_room and t.r = v_cand.r and t.c = v_cand.c
         and (t.state = 'fog'
              or (t.owner_team is distinct from p_team
                  and not t.is_home
                  and t.updated_at < now() - interval '4 seconds'));
      get diagnostics v_hit = row_count;
      if v_hit > 0 then
        return jsonb_build_object(
          'r', v_cand.r, 'c', v_cand.c, 'kind', v_kind,
          'ruin', (select ruin_value from wi_tiles
                    where room_id = p_room and r = v_cand.r and c = v_cand.c));
      end if;
    end loop;
  end loop;
  return null;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 10) Phasen und Punkte
-- ─────────────────────────────────────────────────────────────
-- Lazy statt Cron, wie bei Kingdoms: die Zeit läuft ab, wenn das
-- nächste Mal jemand hinsieht. Ein Hintergrundjob für einen
-- Countdown wäre ein Dienst mehr, der ausfallen kann.
create or replace function wi_maybe_advance(p_room uuid)
  returns wi_boards
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_b wi_boards;
begin
  select * into v_b from wi_boards where room_id = p_room;
  if v_b.room_id is null then
    return v_b;
  end if;

  if v_b.phase = 'countdown' and v_b.countdown_ends_at <= now() then
    update wi_boards
       set phase = 'running', started_at = now(),
           ends_at = now() + make_interval(secs => v_b.duration_secs)
     where room_id = p_room
    returning * into v_b;
  end if;

  if v_b.phase = 'running' then
    -- Zwei Gründe zu enden: die Zeit ist um, oder vorne steht
    -- niemand mehr. Das zweite ist kein Notausgang, sondern die
    -- Regel — die Arena gibt es nur mit Lehrkraft.
    if v_b.ends_at <= now()
       or coalesce(v_b.presenter_seen_at, v_b.started_at) < now() - interval '2 minutes' then
      update wi_boards
         set phase = 'ended', ended_at = now(),
             winner_team = (select owner_team from wi_tiles
                             where room_id = p_room and owner_team is not null
                             group by owner_team
                             order by count(*) + sum(ruin_value) desc, owner_team
                             limit 1)
       where room_id = p_room
      returning * into v_b;
    end if;
  end if;

  return v_b;
end;
$$;

create or replace function wi_teams_json(p_room uuid, p_teams int)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select coalesce(jsonb_agg(x order by (x->>'i')::int), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'i',      t.i,
               'tiles',  coalesce(f.n, 0),
               'ruins',  coalesce(f.rv, 0),
               'score',  coalesce(f.n, 0) + coalesce(f.rv, 0),
               'people', coalesce(p.n, 0)
             ) as x
        from generate_series(0, p_teams - 1) as t(i)
        left join (
          select owner_team, count(*) n, sum(ruin_value) rv
            from wi_tiles where room_id = p_room and owner_team is not null
           group by owner_team
        ) f on f.owner_team = t.i
        left join (
          select team_index, count(*) n from wi_players
           where room_id = p_room group by team_index
        ) p on p.team_index = t.i
    ) s;
$$;

-- Die Karte in zwei Teilen: die Felder selbst ändern sich nie
-- (`map`), die Besitzverhältnisse ständig (`own`). Der Client holt
-- die Karte einmal und bekommt danach je Takt nur noch eine
-- Zeichenkette mit einem Zeichen je Feld — bei 500 Feldern sind
-- das 500 Byte statt 12 KB, dreißigmal alle drei Sekunden.
create or replace function wi_map_json(p_room uuid)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select coalesce(jsonb_agg(jsonb_build_array(r, c, ruin_value,
                              case when is_home then 1 else 0 end)
                            order by r, c), '[]'::jsonb)
    from wi_tiles where room_id = p_room;
$$;

create or replace function wi_own_string(p_room uuid)
  returns text
  stable
  set search_path = public
  language sql
as $$
  select coalesce(string_agg(case when owner_team is null then '.'
                                  else chr(48 + owner_team) end, '' order by r, c), '')
    from wi_tiles where room_id = p_room;
$$;


-- ─────────────────────────────────────────────────────────────
-- 11) Die Aufgabe für die Ansicht
-- ─────────────────────────────────────────────────────────────
create or replace function wi_task_json(p_player wi_players)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select case when p_player.current_item is null then 'null'::jsonb
              else jsonb_build_object(
                     'prompt',  vocab_prompt(p_player.current_item, p_player.current_dir),
                     'dir',     p_player.current_dir,
                     'stage',   p_player.current_stage,
                     'options', to_jsonb(p_player.current_options))
         end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 12) wi_view — das Tablet
-- ─────────────────────────────────────────────────────────────
-- p_full holt die Karte mit. Der Client fragt sie beim ersten Mal
-- und immer dann, wenn map_key sich ändert — eine neue Runde ist
-- eine neue Insel.
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
    -- Außerhalb der Arena: Einzelübung. Die Aufgabe kommt aus
    -- denselben Units, der Fortschritt läuft in dieselbe
    -- Wiedervorlage — nur passiert auf der Karte nichts.
    --
    -- ⚠️ Platzhalter. Das Alleine-Lernen bekommt eine eigene
    -- Metapher; bis dahin ist das hier eine Übungsstrecke ohne
    -- Bild und tut ehrlich so, als wäre es keine.
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
-- 13) wi_answer — der ganze Antwortweg
-- ─────────────────────────────────────────────────────────────
-- Die drei Stufen in einer Funktion, weil sie EINE Entscheidung
-- sind: was mit dieser Eingabe passiert, hängt davon ab, wie weit
-- sie daneben liegt. Zwei Funktionen dafür hießen, den Zustand
-- „ich bin gerade in der Schreibweisen-Auswahl" dem Client zu
-- glauben.
--
-- Die Serie zählt nur SOFORT richtige Antworten. Eine Antwort, die
-- erst über die Auswahl gefunden wurde, zählt fürs Feld, aber
-- nicht für die Serie — sonst wäre die freie Feldwahl mit Raten zu
-- haben.
create or replace function wi_answer(p_token text, p_input text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p      skill_participants;
  v_b      wi_boards;
  v_pl     wi_players;
  v_sets   uuid[];
  v_grade  text;
  v_stage  text;
  v_ok     boolean := false;
  v_result text;
  v_tile   jsonb := null;
  v_solo   boolean;
  v_sol    text;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  v_b := wi_maybe_advance(v_p.room_id);
  if v_b.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_solo := (v_b.phase <> 'running');

  select * into v_pl from wi_players where participant_id = v_p.id;
  if v_pl.participant_id is null or v_pl.current_item is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_pl.lock_until is not null and v_pl.lock_until > now() then
    return jsonb_build_object('ok', false, 'error', 'too_fast',
                              'locked_for', ceil(extract(epoch from v_pl.lock_until - now()))::int);
  end if;

  select array_agg(set_id) into v_sets from wi_room_sets where room_id = v_p.room_id;
  v_stage := v_pl.current_stage;
  v_grade := vocab_grade(v_pl.current_item, v_pl.current_dir, p_input);

  -- In einer Auswahl gibt es kein „fast": was nicht die Lösung ist,
  -- ist daneben. Ohne diese Zeile würde ein Schreibweisen-Ablenker
  -- (der der Lösung naturgemäß ähnelt) eine zweite Auswahl
  -- auslösen, und das Kind käme nie heraus.
  if v_stage <> 'type' then
    v_ok := (v_grade = 'exact');
    v_result := case when v_ok then 'correct' else 'wrong' end;
  elsif v_grade = 'exact' then
    v_ok := true;
    v_result := 'correct';
  elsif v_grade = 'near' then
    v_result := 'spell';
  else
    v_result := 'choice';
  end if;

  -- Zwischenstufe: dieselbe Vokabel, jetzt mit Auswahl. Kein
  -- Fehler, kein Feld, keine Sperre — die Antwort ist noch offen.
  if v_result in ('spell', 'choice') then
    update wi_players
       set current_stage   = v_result,
           current_options = case when v_result = 'spell'
                                  then vocab_spellings(
                                         (vocab_answers(v_pl.current_item, v_pl.current_dir))[1],
                                         btrim(coalesce(p_input, '')))
                                  else vocab_choices(v_sets, v_pl.current_item, v_pl.current_dir, 8)
                             end
     where participant_id = v_p.id;

    select * into v_pl from wi_players where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'result', v_result,
                              'task', wi_task_json(v_pl),
                              'streak', v_pl.streak, 'picks', v_pl.picks);
  end if;

  -- Entschieden. Die Lösung wird JETZT gelesen — nach wi_next_task
  -- steht in current_item das nächste Wort, und der Client bekäme
  -- die Auflösung einer Frage, die er noch gar nicht gesehen hat.
  if not v_ok then
    v_sol := (vocab_answers(v_pl.current_item, v_pl.current_dir))[1];
  end if;

  -- Erst der Karteikasten, dann die Karte.
  perform vocab_record(v_p.id, v_pl.current_item, v_pl.current_dir, v_ok);

  if v_ok then
    -- Serie nur bei sofort richtig; alles andere setzt sie auf null.
    if v_stage = 'type' and v_b.mode = 'type' then
      update wi_players set streak = streak + 1 where participant_id = v_p.id;
    else
      update wi_players set streak = 0, picks = 0 where participant_id = v_p.id;
    end if;

    update wi_players
       set correct_count = correct_count + 1,
           wrong_run = 0, lock_until = null
     where participant_id = v_p.id;
    select * into v_pl from wi_players where participant_id = v_p.id;

    if not v_solo then
      -- Ab der dritten richtigen in Folge wird nicht mehr gewürfelt,
      -- sondern gezeigt: das Kind bekommt eine freie Wahl gutgeschrieben
      -- und sucht sich selbst aus, wohin es geht.
      if v_pl.streak >= 3 then
        update wi_players set picks = least(picks + 1, 3) where participant_id = v_p.id;
      else
        v_tile := wi_take_tile(v_p.room_id, v_pl.team_index);
      end if;
    end if;
  else
    -- Wachsende Sperre gegen schnelles Durchraten (Muster aus 0124).
    update wi_players
       set wrong_count = wrong_count + 1,
           wrong_run   = wrong_run + 1,
           streak      = 0,
           picks       = 0,
           lock_until  = now() + make_interval(secs => least(2 * (wrong_run + 1), 10))
     where participant_id = v_p.id;
  end if;

  perform wi_next_task(v_p.id, v_p.room_id);
  select * into v_pl from wi_players where participant_id = v_p.id;

  return jsonb_build_object(
    'ok', true,
    'result', v_result,
    'solution', v_sol,
    'tile',   v_tile,
    'streak', v_pl.streak,
    'picks',  v_pl.picks,
    'locked_for', greatest(0, ceil(extract(epoch from
                    coalesce(v_pl.lock_until, now()) - now()))::int),
    'task',   wi_task_json(v_pl));
end;
$$;

revoke all on function wi_answer(text, text) from public;
grant execute on function wi_answer(text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 14) wi_pick_tile — die freie Wahl
-- ─────────────────────────────────────────────────────────────
create or replace function wi_pick_tile(p_token text, p_r int, p_c int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p   skill_participants;
  v_b   wi_boards;
  v_pl  wi_players;
  v_hit int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  v_b := wi_maybe_advance(v_p.room_id);
  if v_b.phase is distinct from 'running' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  select * into v_pl from wi_players where participant_id = v_p.id;
  if v_pl.participant_id is null or v_pl.picks < 1 then
    return jsonb_build_object('ok', false, 'error', 'no_pick');
  end if;

  -- Nur am eigenen Rand. Sonst spränge ein Volk quer über die Insel
  -- auf jeden Lichtpunkt, und die anderen sähen zu.
  if not exists (
    select 1 from wi_tiles m
     cross join lateral wi_neighbors(m.r, m.c) n
     where m.room_id = v_p.room_id and m.owner_team = v_pl.team_index
       and n.r = p_r and n.c = p_c)
  then
    return jsonb_build_object('ok', false, 'error', 'not_reachable');
  end if;

  update wi_tiles t
     set owner_team = v_pl.team_index, state = 'open', updated_at = now()
   where t.room_id = v_p.room_id and t.r = p_r and t.c = p_c
     and (t.state = 'fog'
          or (t.owner_team is distinct from v_pl.team_index
              and not t.is_home
              and t.updated_at < now() - interval '4 seconds'));
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    return jsonb_build_object('ok', false, 'error', 'tile_busy');
  end if;

  update wi_players set picks = picks - 1 where participant_id = v_p.id;

  return jsonb_build_object('ok', true,
    'tile', jsonb_build_object('r', p_r, 'c', p_c,
              'ruin', (select ruin_value from wi_tiles
                        where room_id = v_p.room_id and r = p_r and c = p_c)),
    'picks', v_pl.picks - 1);
end;
$$;

revoke all on function wi_pick_tile(text, int, int) from public;
grant execute on function wi_pick_tile(text, int, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 15) Das Pult
-- ─────────────────────────────────────────────────────────────
-- Ein Helfer für alle Pult-Funktionen: Code auflösen, Eigentum
-- prüfen, Anwesenheit stempeln. Fremder Raum und nicht existenter
-- Raum sehen gleich aus (wie in 0080) — sonst wäre das hier ein
-- Code-Orakel.
create or replace function wi_owned_room(p_code text)
  returns uuid
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
begin
  if v_user is null then
    return null;
  end if;
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return null;
  end if;
  perform wi_ensure_board(v_room.id);
  update wi_boards set presenter_seen_at = now() where room_id = v_room.id;
  return v_room.id;
end;
$$;

create or replace function wi_room_get(p_code text, p_full boolean default false)
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
  v_b := wi_maybe_advance(v_room);

  return jsonb_build_object(
    'ok',      true,
    'role',    'presenter',
    'phase',   v_b.phase,
    'mode',    v_b.mode,
    'direction', v_b.direction,
    'teams',   wi_teams_json(v_room, v_b.team_count),
    'team_count', v_b.team_count,
    'duration',   v_b.duration_secs,
    'radius',     v_b.radius,
    'seed',       v_b.seed,
    'map_key', v_room::text || ':' || coalesce(v_b.started_at, v_b.created_at)::text,
    'map',     case when p_full then wi_map_json(v_room) else null end,
    'own',     wi_own_string(v_room),
    'ends_at', v_b.ends_at,
    'countdown_ends_at', v_b.countdown_ends_at,
    'winner_team', v_b.winner_team,
    'sets', coalesce((select jsonb_agg(set_id) from wi_room_sets where room_id = v_room), '[]'::jsonb),
    -- Die Aufstellung sieht nur das Pult, und nur mit Namen: sie
    -- ist zum Vorlesen da („Tablet 7, du bist bei den
    -- Socken-Piraten"), nicht zum Bewerten.
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seat', p.seat,
               'name', coalesce(p.name, 'Tablet ' || p.seat),
               'team', w.team_index,
               'correct', coalesce(w.correct_count, 0),
               'wrong',   coalesce(w.wrong_count, 0)) order by p.seat)
        from skill_participants p
        left join wi_players w on w.participant_id = p.id
       where p.room_id = v_room), '[]'::jsonb)
  );
end;
$$;

revoke all on function wi_room_get(text, boolean) from public;
grant execute on function wi_room_get(text, boolean) to authenticated;


-- Einstellungen der Lobby. Alles in einem Aufruf, weil es EIN
-- Formular ist — und weil ein halb übernommener Satz Einstellungen
-- (Richtung neu, Units alt) niemandem hilft.
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
     set team_count    = coalesce(p_teams, team_count),
         duration_secs = coalesce(p_duration, duration_secs),
         direction     = coalesce(p_direction, direction),
         mode          = coalesce(p_mode, mode)
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


create or replace function wi_room_start(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   uuid := wi_owned_room(p_code);
  v_b      wi_boards;
  v_people int;
  v_n      int;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_b from wi_boards where room_id = v_room;

  if not exists (select 1 from wi_room_sets where room_id = v_room) then
    return jsonb_build_object('ok', false, 'error', 'no_sets');
  end if;

  select count(*) into v_people from skill_participants where room_id = v_room;

  -- Alte Aufstellung weg: eine neue Runde ist eine neue Insel und
  -- eine neue Verteilung. Die Wiedervorlage (vocab_progress) bleibt
  -- — was ein Kind kann, kann es auch in der zweiten Runde.
  delete from wi_players where room_id = v_room;
  insert into wi_players (participant_id, room_id, team_index)
  select p.id, v_room, (dense_rank() over (order by p.seat) - 1)::int % v_b.team_count
    from skill_participants p
   where p.room_id = v_room;

  v_n := wi_build_island(v_room, v_b.team_count, v_people, v_b.duration_secs);

  update wi_boards
     set phase = 'countdown',
         countdown_ends_at = now() + interval '5 seconds',
         started_at = null, ends_at = null, ended_at = null, winner_team = null,
         seed = (floor(random() * 1000000))::int,
         presenter_seen_at = now()
   where room_id = v_room;

  return jsonb_build_object('ok', true, 'tiles', v_n);
end;
$$;

revoke all on function wi_room_start(text) from public;
grant execute on function wi_room_start(text) to authenticated;


create or replace function wi_room_end(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update wi_boards
     set phase = 'ended', ended_at = now(),
         winner_team = (select owner_team from wi_tiles
                         where room_id = v_room and owner_team is not null
                         group by owner_team
                         order by count(*) + sum(ruin_value) desc, owner_team
                         limit 1)
   where room_id = v_room and phase in ('countdown', 'running');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function wi_room_end(text) from public;
grant execute on function wi_room_end(text) to authenticated;


-- Neu mischen: dieselbe Zahl Völker, andere Verteilung. Nur in der
-- Lobby — mitten im Spiel das Volk zu wechseln hieße, sein Land
-- stehenzulassen.
create or replace function wi_room_shuffle(p_code text)
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
  if v_b.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  delete from wi_players where room_id = v_room;
  insert into wi_players (participant_id, room_id, team_index)
  select p.id, v_room, (row_number() over (order by random()) - 1)::int % v_b.team_count
    from skill_participants p
   where p.room_id = v_room;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function wi_room_shuffle(text) from public;
grant execute on function wi_room_shuffle(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 16) Die Vokabellisten am Pult
-- ─────────────────────────────────────────────────────────────
-- Drei Durchreichen auf 0130. Sie sehen überflüssig aus und sind es
-- nicht: die Werkzeug-Schnittstelle (lib/tool.js) stellt JEDEM
-- Aufruf der Beamer-Rolle `p_code` voran. Eine Funktion ohne diesen
-- Parameter ist aus einem Werkzeug heraus schlicht nicht
-- erreichbar.
--
-- Die Alternative wäre, das Werkzeug am Poller vorbei selbst zum
-- Server greifen zu lassen — und damit die eine Stelle aufzugeben,
-- an der steht, wie eine Rolle an ihre Daten kommt. Drei
-- Wrapper sind billiger als zwei Wege in den Server.
create or replace function wi_sets_list(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
  v_list jsonb;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_list := vocab_sets_list();
  if not (v_list->>'ok')::boolean then
    return v_list;
  end if;
  return v_list || jsonb_build_object('chosen', coalesce(
    (select jsonb_agg(set_id) from wi_room_sets where room_id = v_room), '[]'::jsonb));
end;
$$;

revoke all on function wi_sets_list(text) from public;
grant execute on function wi_sets_list(text) to authenticated;


create or replace function wi_set_import(p_code text, p_title text, p_text text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if wi_owned_room(p_code) is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return vocab_set_import(p_title, p_text);
end;
$$;

revoke all on function wi_set_import(text, text, text) from public;
grant execute on function wi_set_import(text, text, text) to authenticated;


create or replace function wi_set_delete(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if wi_owned_room(p_code) is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- Auch aus den Räumen nehmen, in denen sie gewählt war: sonst
  -- stünde in wi_room_sets eine Liste, die es nicht mehr gibt.
  -- (Der Fremdschlüssel räumt das mit, die Zeile hier ist nur
  -- ehrlicher als sich darauf zu verlassen.)
  delete from wi_room_sets where set_id = p_id;
  return vocab_set_delete(p_id);
end;
$$;

revoke all on function wi_set_delete(text, uuid) from public;
grant execute on function wi_set_delete(text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 17) Die Auswertung: welche Wörter die Klasse reißt
-- ─────────────────────────────────────────────────────────────
-- Ohne Namen, und das ist keine Vorsicht, sondern der Zweck: die
-- Liste ist da, um die nächste Stunde zu planen, nicht um jemanden
-- zu finden.
create or replace function wi_hard_words(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'words', coalesce((
    select jsonb_agg(x order by (x->>'wrong')::int desc, x->>'term')
      from (
        select jsonb_build_object(
                 'term',  i.term,
                 'trans', i.translation,
                 'wrong', sum(pr.wrong)::int,
                 'seen',  sum(pr.seen)::int) as x
          from vocab_progress pr
          join skill_participants p on p.id = pr.participant_id
          join vocab_items i on i.id = pr.item_id
         where p.room_id = v_room
         group by i.id, i.term, i.translation
        having sum(pr.wrong) > 0
         limit 20
      ) t
  ), '[]'::jsonb));
end;
$$;

revoke all on function wi_hard_words(text) from public;
grant execute on function wi_hard_words(text) to authenticated;
