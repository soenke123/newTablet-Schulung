-- ══════════════════════════════════════════════════════════════
-- Migration 0146 — Myth of Wordisland: die Ruinen
-- ══════════════════════════════════════════════════════════════
-- Seit 0131 liegen auf der Insel „Lichtpunkte": wi_tiles.ruin_value
-- 1–3, allein nach dem Abstand zur Mitte vergeben, und sie tun genau
-- eine Sache — sie zählen in der Wertung extra. Angreifbar sind sie
-- wie jedes andere Feld.
--
-- Jetzt sind es fünf gezeichnete Orte mit drei Eigenschaften:
--
--   Ruine            Leben  Herzen  Wert   Fähigkeit beim Einnehmen
--   ─────────────────────────────────────────────────────────────
--   Klo (klo)          2       1      5    —
--   Torbogen (tor)     3       2     10    —
--   Arena (arena)      4       3      4    3 freie Feldwahlen
--   Lichttempel (licht) 5      4      5    5 eigene Frontfelder +1 Herz
--   Schattentempel      5      4      5    ein Feld + 6 Nachbarn zu Nebel
--
-- ── Warum EINE Zahl `hearts` und nicht „Leben" ────────────────
-- Sönkes Vorgabe: „Das Feld selbst ist auch ein Herz, also bei 3
-- Leben hat das Feld 2 Herzen." Gespeichert wird deshalb, was man
-- auch anzeigt: die Treffer, die abzutragen sind, BEVOR der nächste
-- das Feld nimmt. Dieselbe Zahl trägt den Schutz des Lichttempels
-- auf ganz normalen Feldern — beide beantworten dieselbe Frage
-- („wie oft muss ich noch treffen"), also darf es dafür nicht zwei
-- Begriffe geben.
--
-- ── Ruinen fallen nur mit einer Serie ─────────────────────────
-- Der Zufallsgriff (wi_take_tile) überspringt Ruinenfelder
-- vollständig, auch im Nebel — die Regel steht in wi_border, also an
-- der einen Stelle, die die Kandidaten sucht. Angegriffen wird eine
-- Ruine ausschließlich über die freie Feldwahl, und die gibt es erst
-- ab drei richtigen in Folge. Damit bekommt die Serie ein Ziel, das
-- man auf der Karte sieht, und `picks` ist nicht länger eine nette
-- Zugabe, sondern die einzige Währung, mit der man an die großen
-- Orte kommt.
--
-- ── Das Geheimnis ─────────────────────────────────────────────
-- Im Nebel verrät der Schein nur die KLASSE (klein/groß) — die
-- steckt in der Karte, die sich nie ändert (wi_map_json). WELCHE
-- Ruine dort steht, sagt der erste Treffer: `revealed`. Deshalb
-- fahren Typ und Herzen je Takt als Zeichenkette mit, im selben
-- Muster wie `own` seit 0131 (ein Zeichen je Feld) — 500 Byte statt
-- einer zweiten Kartenabfrage.
--
-- ── Zwei Prüfregeln werden ERSETZT ────────────────────────────
-- `wi_tiles_ruin_value_check` (0..3) und `wi_players_picks_check`
-- (0..3) lassen die neuen Zahlen nicht durch. Eine Prüfregel lässt
-- sich in Postgres nicht ändern, nur ersetzen; das Muster dafür
-- steht in 0135 (DO-Block, Entscheidung an der DEFINITION und nicht
-- am Namen). Sonst kein DROP — Funktionen per `create or replace`,
-- Spalten per `add column if not exists`
-- (Regel: feedback_supabase_no_drop_statements).
--
-- ⚠️ Fehlt diese Migration, liefert wi_view kein `ruins`/`hearts`,
-- und das Gerät zeichnet die alte Karte samt Lichtpunkten weiter.
-- Es sieht dann nicht kaputt aus, sondern alt — genau das ist die
-- Absicht (feedback_missing_migration_looks_like_network).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wi_tiles bekommt Art, Herzen und das Geheimnis
-- ─────────────────────────────────────────────────────────────
alter table wi_tiles add column if not exists ruin_kind text;
alter table wi_tiles add column if not exists hearts    int not null default 0;
alter table wi_tiles add column if not exists revealed  boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conname = 'wi_tiles_ruin_kind_ck'
                    and conrelid = 'public.wi_tiles'::regclass) then
    alter table wi_tiles
      add constraint wi_tiles_ruin_kind_ck
      check (ruin_kind is null
             or ruin_kind in ('klo', 'tor', 'arena', 'licht', 'schatten'));
  end if;

  if not exists (select 1 from pg_catalog.pg_constraint
                  where conname = 'wi_tiles_hearts_ck'
                    and conrelid = 'public.wi_tiles'::regclass) then
    alter table wi_tiles
      add constraint wi_tiles_hearts_ck
      check (hearts between 0 and 4);
  end if;
end $$;

-- Die Wertigkeit reicht jetzt bis zehn (Torbogen). Entschieden wird
-- an der Definition, nicht am Namen — nur so tut ein zweiter Lauf
-- dieser Migration nichts mehr.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_catalog.pg_constraint c
   where c.conname  = 'wi_tiles_ruin_value_check'
     and c.conrelid = 'public.wi_tiles'::regclass;

  if v_def is not null and position('10' in v_def) = 0 then
    alter table wi_tiles drop constraint wi_tiles_ruin_value_check;
    v_def := null;
  end if;

  if v_def is null then
    alter table wi_tiles
      add constraint wi_tiles_ruin_value_check
      check (ruin_value between 0 and 10);
  end if;
end $$;

comment on table wi_tiles is
  'Die Insel eines Raums. ruin_kind > null = besonderer Ort; hearts = Treffer, die noch '
  'abzutragen sind, bevor der nächste das Feld nimmt (Ruinenleben ODER Lichttempel-Schutz).';
comment on column wi_tiles.ruin_kind is
  'klo · tor · arena · licht · schatten. Die Zahlen dazu stehen in wi_ruin_def — dort und nur dort.';
comment on column wi_tiles.revealed is
  'Ob schon jemand draufgeschlagen hat. Vorher sieht die Klasse man (klein/groß), nicht die Art.';

-- Altbestand: Lichtpunkte aus der Zeit vor dieser Migration. Sie
-- liegen nur in Räumen, deren Runde gerade läuft — die nächste
-- würfelt die Insel ohnehin neu. Sie hier stehen zu lassen wäre
-- trotzdem falsch: ein Feld mit ruin_value > 0 und ohne Art zählte
-- ab jetzt als ganz normales Feld, und am Beamer verschwänden
-- mitten in der Stunde die Punkte. Also werden sie zu dem, was sie
-- am ehesten sind: kleine Ruinen.
update wi_tiles
   set ruin_kind = case when ruin_value >= 2 then 'tor' else 'klo' end,
       ruin_value = case when ruin_value >= 2 then 10 else 5 end,
       hearts     = case when ruin_value >= 2 then 2 else 1 end
 where ruin_kind is null and ruin_value > 0;


-- ─────────────────────────────────────────────────────────────
-- 2) wi_players: offene Nebelkränze, größerer Deckel für picks
-- ─────────────────────────────────────────────────────────────
alter table wi_players add column if not exists shadow_pick int not null default 0;

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_catalog.pg_constraint c
   where c.conname  = 'wi_players_picks_check'
     and c.conrelid = 'public.wi_players'::regclass;

  if v_def is not null and position('6' in v_def) = 0 then
    alter table wi_players drop constraint wi_players_picks_check;
    v_def := null;
  end if;

  if v_def is null then
    alter table wi_players
      add constraint wi_players_picks_check
      check (picks between 0 and 6);
  end if;
end $$;

comment on column wi_players.picks is
  'Freie Feldwahl. Wächst mit jeder sofort richtigen Antwort ab Serie 3 und fällt mit der '
  'Serie auf 0. Die Arena schenkt drei auf einmal — deshalb reicht der Deckel seit 0146 bis sechs.';
comment on column wi_players.shadow_pick is
  'Offene Nebelkränze aus dem Schattentempel. Verfallen nicht; sie warten, bis das Kind tippt.';


-- ─────────────────────────────────────────────────────────────
-- 3) wi_ruin_def — die Balance steht genau einmal
-- ─────────────────────────────────────────────────────────────
-- Jede andere Funktion fragt hier nach. Eine Tabelle wäre der
-- zweite naheliegende Weg, aber diese fünf Zeilen sind Spielregeln
-- und keine Daten: sie gehören in die Migration, in der man sie
-- liest, und nicht in einen Seed, den man vergessen kann.
--
-- `hearts_full` ist die Herzenzahl und damit ein Leben WENIGER als
-- in Sönkes Tabelle — das letzte Leben ist das Feld selbst.
create or replace function wi_ruin_def(p_kind text)
  returns table (hearts_full int, value int, big boolean)
  immutable
  set search_path = public
  language sql
as $$
  select d.hearts_full, d.value, d.big
    from (values
      ('klo',      1,  5, false),
      ('tor',      2, 10, false),
      ('arena',    3,  4, true),
      ('licht',    4,  5, true),
      ('schatten', 4,  5, true)
    ) as d(kind, hearts_full, value, big)
   where d.kind = p_kind;
$$;

comment on function wi_ruin_def(text) is
  'Leben (als Herzen), Wertigkeit und Klasse einer Ruine. Die EINE Stelle, an der die Balance steht.';

revoke all on function wi_ruin_def(text) from public;
grant execute on function wi_ruin_def(text) to anon, authenticated, service_role;


-- Der Abstand zweier Felder in Feldbreiten. Stand in 0131 dreimal
-- ausgeschrieben (Landeplätze, Ruinen, Mindestabstand) — beim
-- vierten Mal ist es eine Funktion.
create or replace function wi_tile_gap(p_r1 int, p_c1 int, p_r2 int, p_c2 int)
  returns real
  immutable
  set search_path = public
  language sql
as $$
  select sqrt(power((p_c1 + 0.5 * (p_r1 % 2)) - (p_c2 + 0.5 * (p_r2 % 2)), 2)
            + power((p_r1 - p_r2) * 0.8660254, 2))::real;
$$;

revoke all on function wi_tile_gap(int, int, int, int) from public;
grant execute on function wi_tile_gap(int, int, int, int) to anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) wi_place_ruin — einen Platz suchen und belegen
-- ─────────────────────────────────────────────────────────────
-- Gibt false zurück, wenn nichts passt. Der Aufrufer entscheidet
-- dann, ob er die Bedingungen lockert oder auf diese Ruine
-- verzichtet — eine Insel mit vier Toren statt fünf ist in Ordnung,
-- eine Endlosschleife nicht.
--
-- `p_maxdist` null heißt „überall", `p_gap` ist der Mindestabstand
-- zu jeder anderen Ruine, `p_homegap` der zu jedem Landeplatz. Ein
-- Torbogen direkt neben einer Anlandung wäre kein Ziel, sondern ein
-- Geschenk an das Volk, das zufällig dort landet.
create or replace function wi_place_ruin(p_room uuid, p_kind text,
                                         p_maxdist real, p_gap real, p_homegap real)
  returns boolean
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_d record;
  v_t record;
begin
  select * into v_d from wi_ruin_def(p_kind);
  if v_d.value is null then
    return false;
  end if;

  select t.r, t.c into v_t
    from wi_tiles t
   where t.room_id = p_room
     and not t.is_home
     and t.ruin_kind is null
     and (p_maxdist is null or t.dist <= p_maxdist)
     and not exists (
           select 1 from wi_tiles s
            where s.room_id = p_room and s.ruin_kind is not null
              and wi_tile_gap(s.r, s.c, t.r, t.c) < p_gap)
     and not exists (
           select 1 from wi_tiles h
            where h.room_id = p_room and h.is_home
              and wi_tile_gap(h.r, h.c, t.r, t.c) < p_homegap)
   order by random()
   limit 1;

  if v_t.r is null then
    return false;
  end if;

  update wi_tiles
     set ruin_kind = p_kind, ruin_value = v_d.value, hearts = v_d.hearts_full
   where room_id = p_room and r = v_t.r and c = v_t.c;
  return true;
end;
$$;

revoke all on function wi_place_ruin(uuid, text, real, real, real) from public;
grant execute on function wi_place_ruin(uuid, text, real, real, real) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 5) wi_build_island — dieselbe Insel, andere Orte
-- ─────────────────────────────────────────────────────────────
-- Wörtlich die Fassung aus 0131 (Umriss, Landeplätze), NUR der
-- Block „Die Lichtpunkte" ist ersetzt. Sie steht hier vollständig
-- und nicht als Verweis: eine Funktion, die man beim Lesen erst aus
-- zwei Migrationen zusammensetzen muss, wird beim nächsten Mal
-- falsch zusammengesetzt.
--
-- Neu sind die Regeln für die Verteilung:
--   · Die drei Großen (Schatten, Licht, Arena) liegen im inneren
--     Drittel und weit auseinander — sie sind das, wofür man quer
--     über die Insel läuft.
--   · Tore und Klos sind gleichmäßig gestreut, je drei auf kleinen
--     und bis fünf auf großen Inseln.
--   · Jede Ruine hält Abstand zu jedem Landeplatz.
create or replace function wi_build_island(p_room uuid, p_teams int, p_people int, p_secs int)
  returns int
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  c_per_kid  constant real := 1.6;
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
  v_small  int;
  v_min    real;
  v_kind   text;
  i        int;
  k        int;
  v_ang    real;
  v_home   record;
begin
  delete from wi_tiles where room_id = p_room;

  v_target := greatest(80, least(900,
                (greatest(p_people, 4) * c_per_kid * (p_secs / 60.0))::int));
  v_R      := greatest(6, least(20, ceil(sqrt(v_target / c_area))::int));
  v_cols   := 2 * v_R + 2;
  v_rows   := ceil(2 * v_R / 0.8660254)::int + 1;
  v_cx     := v_R + 0.5;
  v_cy     := (v_rows - 1) / 2.0;

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
  -- Küstenfeld, dessen WINKEL am besten passt (Begründung in 0131).
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
         and exists (select 1 from wi_neighbors(t.r, t.c) n
                      where not exists (select 1 from wi_tiles w
                                         where w.room_id = p_room
                                           and w.r = n.r and w.c = n.c))
         and (i = 2 or not exists (
               select 1 from wi_tiles h
                where h.room_id = p_room and h.is_home
                  and wi_tile_gap(h.r, h.c, t.r, t.c) < v_min))
       order by abs(atan2(sin(atan2(g.y, g.x) - v_ang),
                          cos(atan2(g.y, g.x) - v_ang)))
       limit 1;
      exit when v_home.r is not null;
    end loop;

    update wi_tiles
       set is_home = true, state = 'open', owner_team = k
     where room_id = p_room and r = v_home.r and c = v_home.c;
  end loop;

  -- ── Die drei Großen, innen ──────────────────────────────────
  -- Drei Anläufe mit immer weicheren Bedingungen. Auf einer kleinen
  -- Insel (R = 6, inneres Drittel also ein Kreis von knapp drei
  -- Feldern) passen drei Orte mit vier Feldern Abstand gerade eben;
  -- geht es nicht auf, rücken sie zusammen, statt dass eine Fähigkeit
  -- in dieser Runde fehlt.
  foreach v_kind in array array['schatten', 'licht', 'arena'] loop
    if not wi_place_ruin(p_room, v_kind, 0.45 * v_R, 4.0, 2.0) then
      if not wi_place_ruin(p_room, v_kind, 0.60 * v_R, 2.5, 2.0) then
        perform wi_place_ruin(p_room, v_kind, null, 2.5, 1.5);
      end if;
    end if;
  end loop;

  -- ── Tore und Klos, gestreut ─────────────────────────────────
  -- Drei Felder Abstand: ohne ihn liegen bei Zufall regelmäßig drei
  -- Ruinen nebeneinander, und dann entscheidet eine einzige Ecke das
  -- Spiel. Findet sich kein Platz mehr, gibt es eine weniger.
  v_small := 3 + least(2, (v_n / 250)::int);
  foreach v_kind in array array['tor', 'klo'] loop
    for i in 1 .. v_small loop
      exit when not wi_place_ruin(p_room, v_kind, null, 3.0, 2.0);
    end loop;
  end loop;

  update wi_boards set radius = v_R where room_id = p_room;
  return v_n;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 6) wi_border — der Rand, ohne Ruinen
-- ─────────────────────────────────────────────────────────────
-- Die eine Zeile, an der „Ruinen fallen nur mit einer Serie" hängt:
-- `t.ruin_kind is null`. Sie steht hier und nicht in wi_take_tile,
-- weil hier die Kandidaten entstehen — eine zweite Prüfung weiter
-- hinten wäre eine zweite Wahrheit.
--
-- Geschützte Felder (Lichttempel) bleiben Kandidaten: dort trägt der
-- Zufallsgriff ein Herz ab. Der Rest ist wörtlich 0131.
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
   where t.ruin_kind is null
     and case when p_kind = 'fog'
              then t.state = 'fog'
              else t.state = 'open'
                   and t.owner_team is distinct from p_team
                   and not t.is_home
                   and t.updated_at < now() - interval '4 seconds'
         end
   order by random()
   limit 6;
$$;


-- ─────────────────────────────────────────────────────────────
-- 7) wi_take_tile — der Zufallsgriff, jetzt mit Schild
-- ─────────────────────────────────────────────────────────────
-- Neu ist der erste der beiden Versuche je Kandidat: liegt auf dem
-- Feld ein Schutzherz des Lichttempels, kostet es den Zug, aber kein
-- Land. Sönkes Satz dazu: „So müssen sie gegen 2 mal das Feld
-- treffen, damit das eingenommen wird."
--
-- Die Bedingung bleibt IM update (Muster 0131): bei einer Kollision
-- gewinnt die Zeile und nicht die Anwendung.
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
  v_rest int;
begin
  foreach v_kind in array array['fog', 'enemy'] loop
    for v_cand in select * from wi_border(p_room, p_team, v_kind) loop
      -- a) Geschütztes Feld: ein Herz weg, der Besitzer bleibt.
      update wi_tiles t
         set hearts = t.hearts - 1, updated_at = now()
       where t.room_id = p_room and t.r = v_cand.r and t.c = v_cand.c
         and t.ruin_kind is null
         and t.hearts > 0
         and t.owner_team is distinct from p_team
         and not t.is_home
         and t.updated_at < now() - interval '4 seconds';
      get diagnostics v_hit = row_count;
      if v_hit > 0 then
        select hearts into v_rest from wi_tiles
         where room_id = p_room and r = v_cand.r and c = v_cand.c;
        return jsonb_build_object('r', v_cand.r, 'c', v_cand.c,
                                  'kind', 'guard', 'hearts', v_rest);
      end if;

      -- b) Der normale Fall, wörtlich wie in 0131 — nur dass ein
      --    Feld mit Herzen hier nicht mehr durchrutschen kann.
      update wi_tiles t
         set owner_team = p_team,
             state      = 'open',
             updated_at = now()
       where t.room_id = p_room and t.r = v_cand.r and t.c = v_cand.c
         and t.ruin_kind is null
         and t.hearts = 0
         and (t.state = 'fog'
              or (t.owner_team is distinct from p_team
                  and not t.is_home
                  and t.updated_at < now() - interval '4 seconds'));
      get diagnostics v_hit = row_count;
      if v_hit > 0 then
        return jsonb_build_object('r', v_cand.r, 'c', v_cand.c,
                                  'kind', v_kind, 'ruin', null);
      end if;
    end loop;
  end loop;
  return null;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 8) wi_ruin_capture — die drei Fähigkeiten
-- ─────────────────────────────────────────────────────────────
-- An EINER Stelle, obwohl sie verschiedene Tabellen anfassen: was
-- beim Einnehmen einer Ruine passiert, ist eine Aufzählung, und eine
-- Aufzählung liest man an einem Stück oder gar nicht.
--
-- Der Lichttempel wählt selbst: fünf eigene Felder an der FRONT (ein
-- Nachbar ist Nebel oder gehört einem anderen Volk), die wenigsten
-- Herzen zuerst. Sönkes Deckel von zwei Herzen (= drei Leben) steht
-- in der where-Bedingung und nicht in einem `least()` — ein Feld mit
-- zwei Herzen soll gar nicht erst eines der fünf verbrauchen.
create or replace function wi_ruin_capture(p_room uuid, p_r int, p_c int,
                                           p_team int, p_participant uuid)
  returns jsonb
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_kind text;
  v_n    int := 0;
begin
  select ruin_kind into v_kind from wi_tiles
   where room_id = p_room and r = p_r and c = p_c;

  if v_kind = 'arena' then
    update wi_players set picks = least(picks + 3, 6)
     where participant_id = p_participant;

  elsif v_kind = 'licht' then
    with front as (
      select t.r, t.c
        from wi_tiles t
       where t.room_id = p_room
         and t.owner_team = p_team
         and t.ruin_kind is null
         and t.hearts < 2
         and exists (
               select 1 from wi_neighbors(t.r, t.c) n
                join wi_tiles u on u.room_id = p_room and u.r = n.r and u.c = n.c
               where u.state = 'fog' or u.owner_team is distinct from p_team)
       order by t.hearts, random()
       limit 5
    )
    update wi_tiles t
       set hearts = t.hearts + 1
      from front f
     where t.room_id = p_room and t.r = f.r and t.c = f.c;
    get diagnostics v_n = row_count;

  elsif v_kind = 'schatten' then
    update wi_players set shadow_pick = shadow_pick + 1
     where participant_id = p_participant;
  end if;

  return jsonb_build_object('kind', v_kind, 'guarded', v_n);
end;
$$;

revoke all on function wi_ruin_capture(uuid, int, int, int, uuid) from public;
grant execute on function wi_ruin_capture(uuid, int, int, int, uuid) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 9) wi_pick_tile — der eigentliche Kampf
-- ─────────────────────────────────────────────────────────────
-- Vier Ausgänge statt einem. Die Wahl ist in JEDEM Fall verbraucht:
-- ein Schlag, der nichts kostet, wäre kein Schlag.
--
-- ⚠️ Ruinen tragen KEINE Vier-Sekunden-Sperre. Die gibt es gegen das
-- Ping-Pong zweier Völker um dasselbe Feld — bei einer Ruine kann es
-- das nicht geben, weil jeder Treffer erst ein Herz kostet. Mit
-- Sperre bräuchte ein Lichttempel zwanzig Sekunden Wartezeit
-- zusätzlich zu fünf Serien.
create or replace function wi_pick_tile(p_token text, p_r int, p_c int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_b    wi_boards;
  v_pl   wi_players;
  v_t    wi_tiles;
  v_d    record;
  v_hit  int;
  v_eff  jsonb := null;
  v_res  text;
  v_rest int := 0;
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

  select * into v_t from wi_tiles
   where room_id = v_p.room_id and r = p_r and c = p_c;
  if v_t.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_reachable');
  end if;
  if v_t.is_home then
    return jsonb_build_object('ok', false, 'error', 'home_tile');
  end if;
  if v_t.owner_team is not distinct from v_pl.team_index then
    return jsonb_build_object('ok', false, 'error', 'own_tile');
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

  if v_t.ruin_kind is not null and v_t.hearts > 0 then
    -- a) Treffer auf eine Ruine: ein Herz, und das Geheimnis ist weg.
    update wi_tiles t
       set hearts = t.hearts - 1, revealed = true, updated_at = now()
     where t.room_id = v_p.room_id and t.r = p_r and t.c = p_c
       and t.hearts > 0
       and t.owner_team is distinct from v_pl.team_index;
    get diagnostics v_hit = row_count;
    v_res := 'hit';

  elsif v_t.ruin_kind is not null then
    -- b) Das letzte Leben war das Feld selbst: die Ruine wechselt
    --    den Besitzer und steht für den nächsten Angreifer sofort
    --    wieder mit vollen Herzen da.
    select * into v_d from wi_ruin_def(v_t.ruin_kind);
    update wi_tiles t
       set owner_team = v_pl.team_index, state = 'open',
           revealed = true, hearts = v_d.hearts_full, updated_at = now()
     where t.room_id = v_p.room_id and t.r = p_r and t.c = p_c
       and t.hearts = 0
       and t.owner_team is distinct from v_pl.team_index;
    get diagnostics v_hit = row_count;
    v_res := 'taken';
    if v_hit > 0 then
      v_eff := wi_ruin_capture(v_p.room_id, p_r, p_c, v_pl.team_index, v_p.id);
    end if;

  elsif v_t.hearts > 0 then
    -- c) Ein geschütztes Feld des Gegners: Herz ab, Land bleibt.
    update wi_tiles t
       set hearts = t.hearts - 1, updated_at = now()
     where t.room_id = v_p.room_id and t.r = p_r and t.c = p_c
       and t.hearts > 0
       and t.owner_team is distinct from v_pl.team_index
       and t.updated_at < now() - interval '4 seconds';
    get diagnostics v_hit = row_count;
    v_res := 'guard';

  else
    -- d) Der Normalfall, wörtlich wie in 0131.
    update wi_tiles t
       set owner_team = v_pl.team_index, state = 'open', updated_at = now()
     where t.room_id = v_p.room_id and t.r = p_r and t.c = p_c
       and (t.state = 'fog'
            or (t.owner_team is distinct from v_pl.team_index
                and not t.is_home
                and t.updated_at < now() - interval '4 seconds'));
    get diagnostics v_hit = row_count;
    v_res := 'taken';
  end if;

  if v_hit = 0 then
    return jsonb_build_object('ok', false, 'error', 'tile_busy');
  end if;

  update wi_players set picks = picks - 1 where participant_id = v_p.id;
  select hearts into v_rest from wi_tiles
   where room_id = v_p.room_id and r = p_r and c = p_c;

  return jsonb_build_object('ok', true,
    'tile', jsonb_build_object('r', p_r, 'c', p_c,
              'result', v_res,
              'ruin',   v_t.ruin_kind,
              'hearts', v_rest),
    'effect', v_eff,
    'picks', v_pl.picks - 1,
    'shadow_pick', (select shadow_pick from wi_players where participant_id = v_p.id));
end;
$$;

revoke all on function wi_pick_tile(text, int, int) from public;
grant execute on function wi_pick_tile(text, int, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 10) wi_shadow_strike — der Nebel kommt zurück
-- ─────────────────────────────────────────────────────────────
-- Ein Feld irgendwo auf der Insel und seine sechs Nachbarn werden
-- wieder Nebel: Besitz weg, Schutzherzen weg, Ruinen neutral, mit
-- vollen Leben und wieder geheim — „wie zu Beginn einnehmbar"
-- (Sönke). Landeplätze bleiben verschont; kein Volk soll ohne Feld
-- dasitzen, das ist seit 0131 die Regel.
--
-- Das Wahlrecht verfällt nicht. Es wartet, bis das Kind tippt — auch
-- Minuten später, notfalls bis die Runde vorbei ist.
create or replace function wi_shadow_strike(p_token text, p_r int, p_c int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p   skill_participants;
  v_b   wi_boards;
  v_pl  wi_players;
  v_n   int;
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
  if v_pl.participant_id is null or v_pl.shadow_pick < 1 then
    return jsonb_build_object('ok', false, 'error', 'no_shadow');
  end if;

  if not exists (select 1 from wi_tiles
                  where room_id = v_p.room_id and r = p_r and c = p_c) then
    return jsonb_build_object('ok', false, 'error', 'not_reachable');
  end if;

  update wi_tiles t
     set state      = 'fog',
         owner_team = null,
         revealed   = false,
         hearts     = case when t.ruin_kind is null then 0
                           else (select hearts_full from wi_ruin_def(t.ruin_kind)) end,
         updated_at = now()
   where t.room_id = v_p.room_id
     and not t.is_home
     and ((t.r = p_r and t.c = p_c)
          or exists (select 1 from wi_neighbors(p_r, p_c) n
                      where n.r = t.r and n.c = t.c));
  get diagnostics v_n = row_count;

  update wi_players set shadow_pick = shadow_pick - 1
   where participant_id = v_p.id;

  return jsonb_build_object('ok', true, 'fogged', v_n,
                            'shadow_pick', v_pl.shadow_pick - 1);
end;
$$;

revoke all on function wi_shadow_strike(text, int, int) from public;
grant execute on function wi_shadow_strike(text, int, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 11) Die Wertung
-- ─────────────────────────────────────────────────────────────
-- Ein normales Feld zählt 1, eine Ruine ihre Wertigkeit. `ruins` ist
-- der MEHRwert über die 1 hinaus — nur so bleibt die Zeile am Pult
-- („142 Felder · 38 aus Ruinen") eine Rechnung und keine
-- Doppelzählung.
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
          select owner_team, count(*) n,
                 sum(case when ruin_kind is null then 0 else ruin_value - 1 end) rv
            from wi_tiles where room_id = p_room and owner_team is not null
           group by owner_team
        ) f on f.owner_team = t.i
        left join (
          select team_index, count(*) n from wi_players
           where room_id = p_room group by team_index
        ) p on p.team_index = t.i
    ) s;
$$;

-- Wörtlich 0131, nur die Sortierung des Siegers rechnet mit der
-- neuen Wertigkeit. Steht vollständig da, weil sie sonst aus zwei
-- Migrationen zusammenzusetzen wäre.
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
    if v_b.ends_at <= now()
       or coalesce(v_b.presenter_seen_at, v_b.started_at) < now() - interval '2 minutes' then
      update wi_boards
         set phase = 'ended', ended_at = now(),
             winner_team = (
               select owner_team from wi_tiles
                where room_id = p_room and owner_team is not null
                group by owner_team
                order by count(*)
                       + sum(case when ruin_kind is null then 0
                                  else ruin_value - 1 end) desc, owner_team
                limit 1)
       where room_id = p_room
      returning * into v_b;
    end if;
  end if;

  return v_b;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 12) Was ans Gerät geht
-- ─────────────────────────────────────────────────────────────
-- Die Karte ändert sich nie, also trägt sie nur die KLASSE: 0 nichts,
-- 1 klein (Klo, Tor), 2 groß (Arena, Tempel). Daraus macht das Gerät
-- den Schein im Nebel — man sieht, dass sich ein Angriff lohnt, aber
-- nicht, worauf.
create or replace function wi_map_json(p_room uuid)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select coalesce(jsonb_agg(jsonb_build_array(r, c,
                              case when ruin_kind is null then 0
                                   when (select big from wi_ruin_def(ruin_kind)) then 2
                                   else 1 end,
                              case when is_home then 1 else 0 end)
                            order by r, c), '[]'::jsonb)
    from wi_tiles where room_id = p_room;
$$;

-- Art und Herzen ändern sich dauernd und fahren deshalb je Takt als
-- Zeichenkette mit — dasselbe Muster wie `own` aus 0131, ein Zeichen
-- je Feld in derselben Reihenfolge.
--
-- Ein Punkt heißt „nichts zu sehen": entweder liegt dort keine Ruine,
-- oder sie hat noch keinen Treffer abbekommen.
--
-- ⚠️ Der Besitz deckt ebenfalls auf, und das ist kein Schnörkel: eine
-- Ruine, die einem Volk gehört, MUSS man sehen — sonst stünde auf der
-- Karte ein eingefärbter Sockel ohne Gebäude darauf. Im normalen Lauf
-- kann das nicht vorkommen (wer einnimmt, hat vorher getroffen); die
-- Bedingung ist der Riegel dagegen, dass ein späterer Eingriff diese
-- Reihenfolge aus Versehen umdreht.
create or replace function wi_ruin_string(p_room uuid)
  returns text
  stable
  set search_path = public
  language sql
as $$
  select coalesce(string_agg(
           case when ruin_kind is null then '.'
                when not revealed and owner_team is null then '.'
                else upper(left(ruin_kind, 1)) end, '' order by r, c), '')
    from wi_tiles where room_id = p_room;
$$;

create or replace function wi_heart_string(p_room uuid)
  returns text
  stable
  set search_path = public
  language sql
as $$
  select coalesce(string_agg(chr(48 + least(hearts, 9)), '' order by r, c), '')
    from wi_tiles where room_id = p_room;
$$;

comment on function wi_ruin_string(uuid) is
  'Ein Zeichen je Feld: K T A L S für eine aufgedeckte Ruine, sonst ein Punkt.';
comment on function wi_heart_string(uuid) is
  'Ein Zeichen je Feld: die Herzen, die noch abzutragen sind.';

revoke all on function wi_ruin_string(uuid) from public;
revoke all on function wi_heart_string(uuid) from public;
grant execute on function wi_ruin_string(uuid) to anon, authenticated, service_role;
grant execute on function wi_heart_string(uuid) to anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────
-- 13) wi_view und wi_room_get — zwei Zeichenketten mehr
-- ─────────────────────────────────────────────────────────────
-- Beide wörtlich in der Fassung von 0133 (Lobby, Völker, Anwesenheit)
-- plus `ruins`, `hearts` und me.shadow_pick.
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
   where w.room_id = v_room.id and w.team_index = v_pl.team_index;

  return jsonb_build_object(
    'ok',      true,
    'role',    'participant',
    'phase',   v_b.phase,
    'mode',    v_b.mode,
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


create or replace function wi_room_get(p_code text, p_full boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   uuid := wi_owned_room(p_code);
  v_b      wi_boards;
  v_online int;
  v_total  int;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_b := wi_maybe_advance(v_room);

  select count(*) filter (where p.last_seen_at > now() - interval '90 seconds'),
         count(*)
    into v_online, v_total
    from skill_participants p where p.room_id = v_room;

  return jsonb_build_object(
    'ok',      true,
    'role',    'presenter',
    'phase',   v_b.phase,
    'mode',    v_b.mode,
    'direction', v_b.direction,
    'teams',   wi_teams_json(v_room, v_b.team_count),
    'team_count', v_b.team_count,
    'factions',   v_b.factions,
    'duration',   v_b.duration_secs,
    'radius',     v_b.radius,
    'seed',       v_b.seed,
    'map_key', v_room::text || ':' || coalesce(v_b.started_at, v_b.created_at)::text,
    'map',     case when p_full then wi_map_json(v_room) else null end,
    'own',     wi_own_string(v_room),
    'ruins',   wi_ruin_string(v_room),
    'hearts',  wi_heart_string(v_room),
    'ends_at', v_b.ends_at,
    'countdown_ends_at', v_b.countdown_ends_at,
    'winner_team', v_b.winner_team,
    'online_count', v_online,
    'room_total',   v_total,
    'sets', coalesce((select jsonb_agg(set_id) from wi_room_sets where room_id = v_room), '[]'::jsonb),
    -- Die Aufstellung sieht nur das Pult, und nur mit Namen: sie
    -- ist zum Vorlesen da („Tablet 7, du bist bei den
    -- Socken-Piraten"), nicht zum Bewerten.
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seat', p.seat,
               'name', coalesce(p.name, 'Tablet ' || p.seat),
               'team', w.team_index,
               'online', p.last_seen_at > now() - interval '90 seconds',
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
