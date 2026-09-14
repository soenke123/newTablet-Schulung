-- ═══════════════════════════════════════════════════════════════
-- 0147 · Myth of Wordisland — der Tag beginnt in Berlin, nicht in
--        Greenwich
-- ═══════════════════════════════════════════════════════════════
-- Sönke, 14.09.2026: „Das Balkendiagramm nimmt nach 12 Uhr nicht den
-- neuen Tag — es steht auf Sonntag, obwohl es Montag ist. Die
-- Durchschnittszeit wird somit auch nicht richtig berechnet. Andere
-- tagesbasierte Punkte werden richtig aktualisiert. Um 6 Uhr morgens
-- hat es dann geklappt."
--
-- ── Was da los war ──────────────────────────────────────────────
-- 0145 hat den Tag ZWEIMAL bestimmt, und zwar verschieden:
--
--   schreiben  wi_solo_time_tick → (now() at time zone 'Europe/Berlin')::date
--   lesen      wi_solo_level_avg_secs, wi_solo_level_history
--              → current_date
--
-- `current_date` ist der Tag in der Zeitzone der SITZUNG, und die
-- ist bei Supabase UTC. Im Sommer liegt Berlin zwei Stunden davor:
-- zwischen 00:00 und 02:00 unserer Zeit ist `current_date` noch
-- gestern. Genau das Fenster, in dem Sönke geschaut hat — und genau
-- deshalb war um 6 Uhr alles richtig, ohne dass jemand etwas getan
-- hätte.
--
-- Die Folgen waren keine Anzeigefehler, sondern Rechenfehler:
--
--   · Das Balkendiagramm lief von „vorgestern minus 6" bis
--     „gestern". Der heutige Tag stand gar nicht darin, der
--     letzte Balken war gestern — und weil der Client den LETZTEN
--     Balken als „heute" hervorhebt, leuchtete der Sonntag.
--   · Der Schnitt der 6-von-7-Regel mittelte dasselbe verschobene
--     Fenster. Wer nach Mitternacht übte, sammelte Sekunden auf
--     einen Tag, den die Rechnung nicht ansah — die Lernzeit war
--     da, sie zählte nur nicht.
--   · `total_days` (Tage dabei) verglich einen UTC-Tag mit einem
--     UTC-Kalendertag aus created_at. Beides falsch herum, aber
--     gleich falsch, deshalb fiel es nicht auf.
--
-- „Andere tagesbasierte Punkte werden richtig aktualisiert" stimmt
-- also: die SCHREIBENDE Seite war von Anfang an richtig. Es war nur
-- niemand da, der sie richtig gelesen hat.
--
-- ── Was diese Migration tut ─────────────────────────────────────
-- Der Tag bekommt EINEN Ort: `wi_solo_today()`. Zwei Schreibweisen
-- für dieselbe Sache sind eine zu viel — genau daraus ist dieser
-- Fehler entstanden. Alle fünf Stellen rufen ab jetzt die Funktion.
--
-- Nachzutragen ist nichts: die Tageszeilen in wi_solo_daily_active
-- standen immer schon auf dem Berliner Tag. Es ändert sich nur, wer
-- sie liest.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wi_solo_today — der eine Ort, an dem „heute" entsteht
-- ─────────────────────────────────────────────────────────────
-- `stable` und nicht `immutable`: innerhalb einer Anweisung steht
-- die Zeit fest (das ist es, was die 6-von-7-Rechnung braucht —
-- sonst könnte ein Aufruf über Mitternacht zwei verschiedene
-- Fenster sehen), über Anweisungen hinweg ändert sie sich.
create or replace function wi_solo_today()
  returns date
  stable
  set search_path = public
  language sql
as $$
  select (now() at time zone 'Europe/Berlin')::date;
$$;

comment on function wi_solo_today() is
  'Der heutige Kalendertag in Europe/Berlin. Der EINZIGE Ort, an dem für die '
  'eigene Insel ein Tag entsteht — Schreiben (wi_solo_time_tick) und Lesen '
  '(Schnitt, Balkendiagramm) müssen denselben Tag meinen. current_date wäre UTC '
  'und läge zwischen Mitternacht und 2 Uhr einen Tag zurück (0147).';


-- ─────────────────────────────────────────────────────────────
-- 2) wi_solo_time_tick — eine Antwort verbuchen
-- ─────────────────────────────────────────────────────────────
-- Rumpf wörtlich aus 0145, nur der Tag kommt jetzt aus der
-- Funktion statt aus einer zweiten Schreibweise desselben.
create or replace function wi_solo_time_tick(p_learner uuid)
  returns void
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_prev timestamptz;
  v_now  timestamptz := now();
  v_day  date := wi_solo_today();
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
  'wi_solo_time_add, auf den heutigen Tag (wi_solo_today). Aufgerufen aus wi_solo_answer.';


-- ─────────────────────────────────────────────────────────────
-- 3) wi_solo_level_avg_secs — die 6-von-7-Regel
-- ─────────────────────────────────────────────────────────────
-- ⚠️ DER EIGENTLICHE FEHLER. Hier stand `current_date`, und damit
-- rechnete der Schnitt nach Mitternacht über ein Fenster, das den
-- heutigen Tag nicht enthielt.
create or replace function wi_solo_level_avg_secs(p_learner uuid)
  returns numeric
  stable
  set search_path = public
  language sql
as $$
  with heute as (select wi_solo_today() as d), days as (
    select gs::date as day, coalesce(a.active_seconds, 0) as secs
      from heute, generate_series(heute.d - 6, heute.d, interval '1 day') gs
      left join wi_solo_daily_active a
             on a.learner_id = p_learner and a.day = gs::date
  ), ranked as (
    select secs, row_number() over (order by secs asc, day asc) as rn from days
  )
  select coalesce(avg(secs) filter (where rn > 1), 0) from ranked;
$$;

comment on function wi_solo_level_avg_secs(uuid) is
  'Schnitt der 6 stärksten der letzten 7 Kalendertage (Sekunden, Europe/Berlin über '
  'wi_solo_today). Der schwächste fällt heraus — ein einzelner schlechter oder '
  'verpasster Tag drückt das Level nicht.';


-- ─────────────────────────────────────────────────────────────
-- 4) wi_solo_level_refresh — Level neu rechnen und schreiben
-- ─────────────────────────────────────────────────────────────
-- Rumpf wörtlich aus 0145. Der Tag stand hier schon richtig, geht
-- aber trotzdem über die Funktion: sonst bliebe eine zweite
-- Schreibweise stehen, und die nächste Änderung fiele wieder
-- auseinander.
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
  -- Rutsch über mehrere Level fallen (oder springen) — siehe 0145.
  loop
    v_next := wi_solo_level_calc(v_avg + v_bonus, v_level);
    exit when v_next = v_level;
    v_level := v_next;
  end loop;
  v_max := greatest(v_max, v_level);

  update wi_solo_learners set level = v_level, level_max = v_max where id = p_learner;

  select active_seconds into v_today from wi_solo_daily_active
   where learner_id = p_learner and day = wi_solo_today();

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
-- 5) wi_solo_level_history — fürs „Wer bist du?"-Modal
-- ─────────────────────────────────────────────────────────────
-- Dieselbe Verschiebung wie bei 3), nur sichtbar: der letzte Balken
-- ist für das Gerät „heute" (er wird hervorgehoben), und der war
-- nach Mitternacht gestern.
--
-- `total_days` rechnet ab jetzt ebenfalls in Berliner Tagen — auch
-- created_at wird dafür umgerechnet. Ein Kind, das sich um 23:30
-- angemeldet hat, ist seit EINEM Tag dabei und nicht seit zweien.
create or replace function wi_solo_level_history(p_token text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l     wi_solo_learners;
  v_heute date := wi_solo_today();
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
        from generate_series(v_heute - 6, v_heute, interval '1 day') gs
        left join wi_solo_daily_active a
               on a.learner_id = v_l.id and a.day = gs::date), '[]'::jsonb),
    'totals', jsonb_build_object(
      'active_days', (select count(*) from wi_solo_daily_active
                        where learner_id = v_l.id and active_seconds > 0),
      'total_days',  (v_heute - (v_l.created_at at time zone 'Europe/Berlin')::date) + 1,
      'total_secs',  coalesce((select sum(active_seconds) from wi_solo_daily_active
                                 where learner_id = v_l.id), 0)));
end;
$$;

revoke all on function wi_solo_level_history(text) from public;
grant execute on function wi_solo_level_history(text) to anon, authenticated;

comment on function wi_solo_level_history(text) is
  'Die letzten 7 Kalendertage einzeln (Europe/Berlin über wi_solo_today, für das '
  'Balkendiagramm im Volk-Modal) plus die Gesamtstatistik seit created_at. Nur bei '
  'Bedarf abgerufen, nicht bei jeder Antwort.';
