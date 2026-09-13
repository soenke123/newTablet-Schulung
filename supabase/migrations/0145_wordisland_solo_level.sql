-- ═══════════════════════════════════════════════════════════════
-- 0145 · Myth of Wordisland — das eigene Level
-- ═══════════════════════════════════════════════════════════════
-- Sönke, 13.09.2026: ein persönliches Level 1–5, das regelmäßiges
-- Lernen belohnt, ohne für einen einzelnen schlechten Tag zu
-- bestrafen. Genau die Lücke, die 0143 offen ließ („das eigene
-- Level kommt als Nächstes, und es gehört genau hierher").
--
-- ── Woraus das Level entsteht ──────────────────────────────────
-- Grundlage ist AKTIVE Lernzeit, nicht Bildschirmzeit — und die
-- Insel hat dafür schon die richtige Form: es gibt bewusst KEINEN
-- Poller (0136), jede Handlung läuft über GENAU einen RPC-Call,
-- wi_solo_answer. Gemessen wird deshalb nicht per Ping, sondern aus
-- dem Abstand zwischen zwei Antworten — gedeckelt auf 20 Sekunden
-- je Antwort:
--
--   · Leerlauf (Tab offen, nichts tun) bringt 0 — es kommt keine
--     Antwort, also gibt es keinen Abstand, der gezählt würde.
--   · Eine lange Pause zwischen zwei Antworten zählt nur bis zum
--     Deckel — 20 Sekunden ist, was Lesen + Tippen + kurzes
--     Nachdenken realistisch braucht, nicht was ein Kind nebenbei
--     am Tablet vergisst.
--   · Sinnloses Klicken bringt fast nichts: der Abstand zwischen
--     zwei Klicks in Serie ist winzig, und winzig plus winzig
--     bleibt winzig.
--
-- Eine Zwischenstufe (spell/choice, siehe 0139) zählt mit — das ist
-- eine echte Eingabe, kein Leerlauf.
--
-- ── Die 6-von-7-Regel ───────────────────────────────────────────
-- Durchschnitt der letzten 7 Kalendertage, aber der schwächste Tag
-- fällt heraus. Ein Tag vor der Kontoerstellung zählt dabei wie ein
-- 0-Minuten-Tag — er existiert einfach nicht als Zeile, und ein
-- fehlender Tag ist nichts anderes als ein Tag ohne Lernzeit.
--
-- ── Puffer: schnell rauf, langsam runter ───────────────────────
-- Die Aufstiegs- und die Abstiegsgrenze sind verschiedene Zahlen.
-- Dazwischen liegt eine Zone, in der ein Level weder fällt noch
-- steigt — das ist der ganze Puffer, und er braucht keine
-- Sonderbehandlung: wi_solo_level_calc prüft für das AKTUELLE Level
-- nur seine eigene Auf- und Abstiegsgrenze, sonst nichts.
--
-- Ein einzelner Aufruf kann trotzdem über mehrere Level springen —
-- wer tagelang nicht öffnet, sieht bei der Rückkehr in einem
-- Rutsch, wo er wirklich steht, statt sich einmal pro Tag
-- „hochzuarbeiten". Die Kaskade steht in wi_solo_level_refresh,
-- nicht in wi_solo_level_calc: die eine bleibt ein reiner Ein-
-- Schritt-Test, den man ohne Kontext lesen und prüfen kann.
--
-- ── Der Mastery-Bonus ───────────────────────────────────────────
-- Wer einen hohen Anteil seiner Vokabeln auf der höchsten Tierstufe
-- hat (wi_solo_stages, unverändert aus 0139 — sie läuft schon über
-- ALLE freigespielten Units, nicht nur die gerade aktiven), bekommt
-- Bonus-Sekunden auf den Durchschnitt. Das ist ein Bonus auf die
-- MESSGRÖSSE und keine eigene Zone: er zählt einfach mit, bevor
-- wi_solo_level_calc die Schwellen prüft.
--
-- ── Die Krone ───────────────────────────────────────────────────
-- level_max sinkt nie — nur `greatest()`. So bleibt ein einmal
-- erreichtes Level-5 ein Erfolg, auch wenn das AKTUELLE Level
-- später wieder fällt.
--
-- ── Was hier steht ──────────────────────────────────────────────
--   1  Spalten auf wi_solo_learners, Tabelle wi_solo_daily_active
--   2  Reine Funktionen: Zeit-Deckel, Levelschritt, Bonus
--   3  wi_solo_time_tick        eine Antwort verbuchen
--   4  wi_solo_level_avg_secs   6-von-7-Tage-Schnitt
--   5  wi_solo_level_refresh    Level neu rechnen und schreiben
--   6  wi_solo_level_history    7-Tage-Reihe + Gesamtstatistik
--   7  wi_solo_open · wi_solo_answer   eingehängt
--
-- Kein DROP — `add column if not exists`, `create table if not
-- exists`, `create or replace function`
-- (Regel: feedback_supabase_no_drop_statements).
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalten und Tabelle
-- ─────────────────────────────────────────────────────────────
alter table wi_solo_learners add column if not exists level             int not null default 1;
alter table wi_solo_learners add column if not exists level_max         int not null default 1;
alter table wi_solo_learners add column if not exists time_last_event_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wi_solo_learners_level_range') then
    alter table wi_solo_learners
      add constraint wi_solo_learners_level_range check (level between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wi_solo_learners_level_max_range') then
    alter table wi_solo_learners
      add constraint wi_solo_learners_level_max_range check (level_max between 1 and 5);
  end if;
end $$;

comment on column wi_solo_learners.level is
  'Aktuelles Spieler-Level 1..5, aus der aktiven Lernzeit der letzten 7 Tage. '
  'Fällt langsamer, als es steigt — siehe wi_solo_level_calc.';
comment on column wi_solo_learners.level_max is
  'Höchstes je erreichtes Level. Sinkt nie (nur greatest()) — die Krone.';
comment on column wi_solo_learners.time_last_event_at is
  'Zeitpunkt der letzten Antwort (auch Zwischenstufen). Grundlage für den '
  'gedeckelten Zeitzuwachs in wi_solo_time_tick.';

-- Vorbild: bonbon_daily_claims (0044) — der Tag wird IMMER serverseitig
-- über die Berliner Zeitzone bestimmt, nie vom Client übernommen.
create table if not exists wi_solo_daily_active (
  learner_id     uuid not null references wi_solo_learners(id) on delete cascade,
  day            date not null,
  active_seconds int  not null default 0,
  primary key (learner_id, day)
);

comment on table wi_solo_daily_active is
  'Aktive Lernsekunden je Lernendem und Kalendertag (Europe/Berlin). '
  'Geschrieben ausschließlich von wi_solo_time_tick, gelesen von '
  'wi_solo_level_avg_secs und wi_solo_level_history.';

alter table wi_solo_daily_active enable row level security;
grant select, insert, update, delete on wi_solo_daily_active to service_role;


-- ─────────────────────────────────────────────────────────────
-- 2) Reine Funktionen — kein Seitenschritt, einzeln testbar
-- ─────────────────────────────────────────────────────────────
create or replace function wi_solo_time_add(p_prev timestamptz, p_now timestamptz)
  returns int
  immutable
  set search_path = public
  language sql
as $$
  select case when p_prev is null then 0
              else least(greatest(extract(epoch from (p_now - p_prev))::int, 0), 20)
         end;
$$;

comment on function wi_solo_time_add(timestamptz, timestamptz) is
  'Gedeckelter Abstand zweier Antworten in Sekunden, 0..20. Kein Vorgänger = 0 '
  '(die allererste Antwort eines Kontos schenkt sich nichts).';


-- EIN Schritt der Hysterese. Bewusst kein Sprung über mehrere Level in
-- diesem Aufruf — das steht in wi_solo_level_refresh, damit diese
-- Funktion ohne Kontext lesbar und prüfbar bleibt: „was passiert bei
-- GENAU diesem Durchschnitt und GENAU diesem Level" und sonst nichts.
create or replace function wi_solo_level_calc(p_avg_secs numeric, p_current int)
  returns int
  immutable
  set search_path = public
  language sql
as $$
  select case least(greatest(coalesce(p_current, 1), 1), 5)
    when 1 then case when p_avg_secs >= 120 then 2 else 1 end
    when 2 then case when p_avg_secs >= 300 then 3
                     when p_avg_secs < 60   then 1
                     else 2 end
    when 3 then case when p_avg_secs >= 420 then 4
                     when p_avg_secs < 180  then 2
                     else 3 end
    when 4 then case when p_avg_secs >= 600 then 5
                     when p_avg_secs < 360  then 3
                     else 4 end
    when 5 then case when p_avg_secs < 480 then 4 else 5 end
  end;
$$;

comment on function wi_solo_level_calc(numeric, int) is
  'Ein Hysterese-Schritt: Aufstiegsgrenze und Abstiegsgrenze des AKTUELLEN Levels, '
  'sonst nichts. Aufstieg 2min/5min/7min/10min, Abstieg 1min/3min/6min/8min — bewusst '
  'niedriger, damit ein einzelner schwacher Tag nicht sofort ein Level kostet.';


create or replace function wi_solo_level_bonus_secs(p_pct numeric)
  returns int
  immutable
  set search_path = public
  language sql
as $$
  select case when p_pct is null then 0
              when p_pct >= 95   then 180
              when p_pct >= 75   then 120
              when p_pct >= 50   then 60
              else 0
         end;
$$;

comment on function wi_solo_level_bonus_secs(numeric) is
  'Bonus-Sekunden auf den Durchschnitt, aus dem Anteil der Vokabeln auf der '
  'höchsten Tierstufe (wi_solo_stages). 95%→3min, 75%→2min, 50%→1min.';


-- ─────────────────────────────────────────────────────────────
-- 3) wi_solo_time_tick — eine Antwort verbuchen
-- ─────────────────────────────────────────────────────────────
create or replace function wi_solo_time_tick(p_learner uuid)
  returns void
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_prev timestamptz;
  v_now  timestamptz := now();
  v_day  date := (v_now at time zone 'Europe/Berlin')::date;
  v_add  int;
begin
  select time_last_event_at into v_prev from wi_solo_learners where id = p_learner;
  v_add := wi_solo_time_add(v_prev, v_now);

  update wi_solo_learners set time_last_event_at = v_now where id = p_learner;

  insert into wi_solo_daily_active (learner_id, day, active_seconds)
  values (p_learner, v_day, v_add)
  on conflict (learner_id, day) do update
    set active_seconds = wi_solo_daily_active.active_seconds + v_add;
end;
$$;

comment on function wi_solo_time_tick(uuid) is
  'Verbucht EINE Antwort (auch Zwischenstufen) als aktive Zeit, gedeckelt über '
  'wi_solo_time_add, auf den heutigen Tag (Europe/Berlin). Aufgerufen aus wi_solo_answer.';


-- ─────────────────────────────────────────────────────────────
-- 4) wi_solo_level_avg_secs — die 6-von-7-Regel
-- ─────────────────────────────────────────────────────────────
-- Der schwächste der letzten 7 Kalendertage fällt heraus, die
-- übrigen 6 werden gemittelt. Tage ohne Zeile (vor der Konto-
-- erstellung oder einfach ohne Übung) zählen dabei wie 0 Minuten —
-- generate_series füllt sie, ohne dass ein Sonderfall nötig wäre.
create or replace function wi_solo_level_avg_secs(p_learner uuid)
  returns numeric
  stable
  set search_path = public
  language sql
as $$
  with days as (
    select gs::date as day, coalesce(a.active_seconds, 0) as secs
      from generate_series(current_date - 6, current_date, interval '1 day') gs
      left join wi_solo_daily_active a
             on a.learner_id = p_learner and a.day = gs::date
  ), ranked as (
    select secs, row_number() over (order by secs asc, day asc) as rn from days
  )
  select coalesce(avg(secs) filter (where rn > 1), 0) from ranked;
$$;

comment on function wi_solo_level_avg_secs(uuid) is
  'Schnitt der 6 stärksten der letzten 7 Kalendertage (Sekunden). Der schwächste '
  'fällt heraus — ein einzelner schlechter oder verpasster Tag drückt das Level nicht.';


-- ─────────────────────────────────────────────────────────────
-- 5) wi_solo_level_refresh — Level neu rechnen und schreiben
-- ─────────────────────────────────────────────────────────────
create or replace function wi_solo_level_refresh(p_learner uuid)
  returns jsonb
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_avg   numeric;
  v_pct   numeric;
  v_bonus int;
  v_level int;
  v_max   int;
  v_next  int;
  v_today int;
begin
  select level, level_max into v_level, v_max from wi_solo_learners where id = p_learner;
  v_level := coalesce(v_level, 1);
  v_max   := coalesce(v_max, 1);

  v_avg := wi_solo_level_avg_secs(p_learner);

  select (count(*) filter (where stage = 4))::numeric / nullif(count(*), 0) * 100
    into v_pct
    from wi_solo_stages(p_learner);
  v_bonus := wi_solo_level_bonus_secs(v_pct);

  -- Kaskade: nach langer Abwesenheit darf der Schnitt in einem
  -- Rutsch über mehrere Level fallen (oder springen) — siehe Kopf.
  loop
    v_next := wi_solo_level_calc(v_avg + v_bonus, v_level);
    exit when v_next = v_level;
    v_level := v_next;
  end loop;
  v_max := greatest(v_max, v_level);

  update wi_solo_learners set level = v_level, level_max = v_max where id = p_learner;

  select active_seconds into v_today from wi_solo_daily_active
   where learner_id = p_learner and day = (now() at time zone 'Europe/Berlin')::date;

  return jsonb_build_object(
    'level',      v_level,
    'level_max',  v_max,
    'today_secs', coalesce(v_today, 0),
    'avg_secs',   round(v_avg),
    'bonus_secs', v_bonus,
    'pct_max',    round(coalesce(v_pct, 0), 1),
    'up_secs',    case v_level when 1 then 120 when 2 then 300
                               when 3 then 420 when 4 then 600 else null end,
    'down_secs',  case v_level when 2 then 60  when 3 then 180
                               when 4 then 360 when 5 then 480 else null end);
end;
$$;

comment on function wi_solo_level_refresh(uuid) is
  'Rechnet Level + Krone aus wi_solo_level_avg_secs + Mastery-Bonus neu, schreibt '
  'beide und gibt den Stand fürs Gerät zurück (up_secs/down_secs = Schwellen des '
  'JETZT geltenden Levels, null wo es keine gibt — Level 1 abwärts, Level 5 aufwärts). '
  'Aufgerufen aus wi_solo_open (Tageswechsel ohne neue Antwort) und wi_solo_answer.';


-- ─────────────────────────────────────────────────────────────
-- 6) wi_solo_level_history — fürs „Wer bist du?"-Modal
-- ─────────────────────────────────────────────────────────────
-- Eigener, separater Aufruf statt Teil von wi_solo_open/_view: wird
-- nur gebraucht, wenn das Modal aufgeht (Muster wie wi_solo_unit,
-- 0142) — der heiße Pfad (jede Antwort) bekommt keine zusätzliche
-- Auskunft, die dort niemand ansieht.
create or replace function wi_solo_level_history(p_token text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l wi_solo_learners;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',  to_char(gs::date, 'YYYY-MM-DD'),
               'secs', coalesce(a.active_seconds, 0))
             order by gs::date)
        from generate_series(current_date - 6, current_date, interval '1 day') gs
        left join wi_solo_daily_active a
               on a.learner_id = v_l.id and a.day = gs::date), '[]'::jsonb),
    'totals', jsonb_build_object(
      'active_days', (select count(*) from wi_solo_daily_active
                        where learner_id = v_l.id and active_seconds > 0),
      'total_days',  (current_date - v_l.created_at::date) + 1,
      'total_secs',  coalesce((select sum(active_seconds) from wi_solo_daily_active
                                 where learner_id = v_l.id), 0)));
end;
$$;

revoke all on function wi_solo_level_history(text) from public;
grant execute on function wi_solo_level_history(text) to anon, authenticated;

comment on function wi_solo_level_history(text) is
  'Die letzten 7 Kalendertage einzeln (für das Balkendiagramm im Volk-Modal) plus '
  'die Gesamtstatistik seit created_at. Nur bei Bedarf abgerufen, nicht bei jeder Antwort.';


-- ─────────────────────────────────────────────────────────────
-- 7) Einhängen — wi_solo_open
-- ─────────────────────────────────────────────────────────────
-- Rumpf wörtlich aus 0136, plus das Level. Ein Tageswechsel ohne
-- neue Antwort (die Nacht ist vorbei, gestern fällt aus dem
-- 7-Tage-Fenster) muss beim nächsten Öffnen sichtbar sein, auch
-- ohne dass vorher etwas beantwortet wurde.
create or replace function wi_solo_open(p_token text default null)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l      wi_solo_learners;
  v_player jsonb;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    -- Kein Fehler. „Du warst noch in keinem Raum" ist eine
    -- Antwort und kein Fehlschlag.
    return jsonb_build_object('ok', true, 'learner', null);
  end if;

  update wi_solo_learners set last_seen_at = now() where id = v_l.id;
  v_player := wi_solo_level_refresh(v_l.id);

  return jsonb_build_object('ok', true, 'learner', jsonb_build_object(
    'token',    v_l.token,
    'seed',     v_l.seed,
    'settings', v_l.settings,
    'words',    (select count(*) from wi_solo_stages(v_l.id)),
    'grown',    (select count(*) from wi_solo_stages(v_l.id) where stage >= 3),
    'sets',     coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'level', s.level, 'theme', s.theme,
               'count', (select count(*) from vocab_items i where i.set_id = s.id))
             order by s.level, s.title)
        from wi_solo_sets ss join vocab_sets s on s.id = ss.set_id
       where ss.learner_id = v_l.id), '[]'::jsonb),
    'player',   v_player));
end;
$$;

revoke all on function wi_solo_open(text) from public;
grant execute on function wi_solo_open(text) to anon, authenticated;

-- wi_solo_view (0136) hängt das Level automatisch mit ein: sie baut
-- ihr Ergebnis über `(wi_solo_open(p_token)) || jsonb_build_object(…)`
-- zusammen und muss deshalb hier NICHT angefasst werden.


-- ─────────────────────────────────────────────────────────────
-- 7b) Einhängen — wi_solo_answer
-- ─────────────────────────────────────────────────────────────
-- Rumpf wörtlich aus 0140 (der höchsten bestehenden Fassung — wer
-- diese Funktion später anfasst, nimmt DIESE hier als Vorlage;
-- Regel: feedback_shop_state_merge_regressions).
--
-- Geändert sind drei Stellen:
--
--   1) Der Zeit-Tick direkt nach der Sperrprüfung. Jede Antwort, die
--      bis dorthin kommt, ist eine echte Eingabe — auch eine
--      Zwischenstufe, denn getippt hat das Kind ja.
--   2) v_before_p, gelesen aus der Zeile, BEVOR sich etwas ändert.
--      Daran erkennt das Gerät einen Aufstieg.
--   3) wi_solo_level_refresh in BEIDEN Rückgabewegen — aber jeweils
--      so SPÄT wie möglich.
--
-- ⚠️ Zu 3): der Aufruf steht bewusst NICHT einmal oben für beide
-- Wege. Im entschiedenen Weg werden erst darunter die Punkte gebucht,
-- und die können die letzte Vokabel auf die höchste Stufe heben —
-- also den Mastery-Bonus und mit ihm das Level ändern. Oben gerufen
-- käme dieser Aufstieg erst bei der NÄCHSTEN Antwort an, und das
-- sähe aus wie ein verschlucktes Ereignis.
--
-- Gerufen wird er trotzdem nur EINMAL je Antwort: er rechnet über
-- alle Wörter des Kindes (wi_solo_stages ohne Filter), und das ist
-- der teuerste Posten dieser Funktion.
create or replace function wi_solo_answer(p_token text, p_input text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l        wi_solo_learners;
  v_sets     uuid[];
  v_grade    text;
  v_stage    text;
  v_mode     text;
  v_helped   boolean;
  v_ok       boolean := false;
  v_result   text;
  v_sol      text;
  v_item     uuid;
  v_dir      text;
  v_gdir     text;
  v_before   int;
  v_after    int;
  v_delta    int;
  v_gegen    int := 0;
  v_extra    int;
  v_offen    int;
  v_pts      int;
  v_before_p int;
  v_player   jsonb;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_l.current_item is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_l.lock_until is not null and v_l.lock_until > now() then
    return jsonb_build_object('ok', false, 'error', 'too_fast',
                              'locked_for', ceil(extract(epoch from v_l.lock_until - now()))::int);
  end if;

  -- Ab hier ist die Antwort echt (die Sperre gegen Durchraten hat
  -- sie passiert) — sie zählt als aktive Zeit, egal ob sie gleich
  -- eine Zwischenstufe oder schon entschieden ist.
  --
  -- Das Level wird hier NOCH NICHT gerechnet: siehe den Kopf, Punkt 3.
  v_before_p := v_l.level;
  perform wi_solo_time_tick(v_l.id);

  v_item  := v_l.current_item;
  v_dir   := v_l.current_dir;
  v_gdir  := case when v_l.current_dir = 'de_en' then 'en_de' else 'de_en' end;
  v_stage := v_l.current_stage;
  v_mode  := coalesce(v_l.settings->>'mode', 'type');
  v_sets  := wi_solo_chosen(v_l.id);
  v_grade := vocab_grade(v_item, v_dir, p_input);

  -- In einer Auswahl gibt es kein „fast": was nicht die Lösung ist,
  -- ist daneben. Sonst löste ein Schreibweisen-Ablenker eine zweite
  -- Auswahl aus, und das Kind käme nie heraus. (Wie 0131.)
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
  -- Fehler, kein Wachsen, keine Sperre, kein Zähler und auch kein
  -- Griff in den Beutel — die Antwort ist offen, und gezählt wird
  -- ein Vorkommen des Wortes und nicht ein Tastendruck.
  if v_result in ('spell', 'choice') then
    update wi_solo_learners
       set current_stage   = v_result,
           current_options = case when v_result = 'spell'
                                  then vocab_spellings(
                                         (vocab_answers(v_item, v_dir))[1],
                                         btrim(coalesce(p_input, '')))
                                  else vocab_choices(v_sets, v_item, v_dir, 8)
                             end,
           last_seen_at    = now()
     where id = v_l.id;

    select * into v_l from wi_solo_learners where id = v_l.id;
    -- Hier ändert sich an den Punkten nichts mehr, also ist das der
    -- späteste Punkt dieses Weges.
    v_player := wi_solo_level_refresh(v_l.id);
    return jsonb_build_object('ok', true, 'result', v_result,
                              'task', wi_solo_task_json(v_l),
                              'player', v_player || jsonb_build_object('level_before', v_before_p));
  end if;

  -- Entschieden. Die Lösung wird JETZT gelesen — nach wi_solo_next
  -- steht in current_item das nächste Wort, und das Gerät bekäme
  -- die Auflösung einer Frage, die es noch nicht gesehen hat.
  if not v_ok then
    v_sol := (vocab_answers(v_item, v_dir))[1];
  end if;

  -- „Mit Hilfe" ist jede richtige Antwort, die nicht auf die
  -- getippte Frage kam — der Vertipper mit Schreibweisen-Auswahl
  -- ebenso wie das Wiedererkennen unter acht. Im Auswahl-Modus ist
  -- also JEDE richtige Antwort eine mit Hilfe, und das ist keine
  -- Härte, sondern die Wahrheit über diesen Modus.
  v_helped := (v_stage <> 'type');

  if v_ok then
    v_delta := case when v_helped then 1 else 3 end;
    -- Eine Kopie zurück in den Beutel bekommt nur, wer die Hilfe im
    -- TIPP-Modus gebraucht hat (0140) — im Auswahl-Modus ist die
    -- Hilfe der Modus selbst und schon mit einem Punkt bezahlt.
    v_extra := case when v_helped and v_mode <> 'choice' then 1 else 0 end;
  else
    v_delta := case when v_mode = 'choice' then -1 else -3 end;
    v_gegen := v_delta;
    v_extra := case when v_mode = 'choice' then  1 else  2 end;
  end if;

  -- Was vor dieser Antwort im Beutel lag. Muss VOR wi_solo_points
  -- gelesen werden: gleich steht dort ein neuer Termin, und mit ihm
  -- ein anderes Kontingent.
  select b.offen into v_offen
    from wi_solo_bag_open(v_l.id, v_item) b
   where b.dir = v_dir;

  select stage into v_before from wi_solo_stages(v_l.id, v_item);

  perform wi_solo_points(v_l.id, v_item, v_dir, v_delta, true);
  if v_gegen <> 0 then
    -- Der Fehler kostet das Tier eine ganze Stufe, nicht nur die
    -- gefragte Richtung. Ohne diese Zeile sähe ein Kind, das in
    -- seiner starken Richtung danebengreift, überhaupt nichts
    -- passieren — und die Stufe ist das Minimum, nicht der Schnitt.
    perform wi_solo_points(v_l.id, v_item, v_gdir, v_gegen, false);
  end if;
  perform wi_solo_tally(v_l.id, v_item, v_dir, v_ok, v_helped);
  perform wi_solo_bag(v_l.id, v_item, v_dir,
                      greatest(0, coalesce(v_offen, 1) - 1) + v_extra);

  select stage  into v_after from wi_solo_stages(v_l.id, v_item);
  select points into v_pts   from wi_solo_progress
   where learner_id = v_l.id and item_id = v_item and dir = v_dir;

  if v_ok then
    update wi_solo_learners
       set correct_count = correct_count + 1,
           wrong_run     = 0,
           lock_until    = null
     where id = v_l.id;
  else
    -- Wachsende Sperre gegen schnelles Durchraten (Muster aus 0124).
    update wi_solo_learners
       set wrong_count = wrong_count + 1,
           wrong_run   = wrong_run + 1,
           lock_until  = now() + make_interval(secs => least(2 * (wrong_run + 1), 10))
     where id = v_l.id;
  end if;

  perform wi_solo_next(v_l.id);
  select * into v_l from wi_solo_learners where id = v_l.id;

  -- JETZT: die Punkte sind gebucht, die Stufen stehen. Erst hier
  -- kennt der Mastery-Bonus die Wahrheit über diese Antwort.
  v_player := wi_solo_level_refresh(v_l.id);

  return jsonb_build_object(
    'ok', true,
    'result',     v_result,
    'solution',   v_sol,
    'item',       v_item,
    'dir',        v_dir,
    'helped',     v_helped,
    'delta',      v_delta,
    'points',     coalesce(v_pts, 0),
    'level_before', v_before,
    'level_after',  v_after,
    'locked_for', greatest(0, ceil(extract(epoch from
                    coalesce(v_l.lock_until, now()) - now()))::int),
    'task',       wi_solo_task_json(v_l),
    'player',     v_player || jsonb_build_object('level_before', v_before_p));
end;
$$;

revoke all on function wi_solo_answer(text, text) from public;
grant execute on function wi_solo_answer(text, text) to anon, authenticated;
