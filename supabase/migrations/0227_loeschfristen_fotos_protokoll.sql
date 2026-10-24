-- ══════════════════════════════════════════════════════════════
-- Migration 0227 — Fotos nach 30 Tagen, Protokoll der Löschläufe
-- ══════════════════════════════════════════════════════════════
-- 1) Fotos in der Projektarbeit (0206, pa_items kind 'log', data.photos)
--    werden 30 Tage nach Projektende gelöscht (Entscheidung,
--    DATENSCHUTZ.md). Projektende =
--      das Fertig-Datum im Projektziel (goal/main, data.due, JJJJ-MM-TT),
--      sonst die letzte Aktivität im Raum (skill_rooms.last_active_at).
--    Der Eintrag bleibt; statt der Fotos steht data.photos_expired = n
--    (die Oberfläche schreibt „Fotos nach 30 Tagen gelöscht“). version
--    und pa_rooms.rev steigen, damit offene Geräte neu laden.
--    Bilder im Projektziel (goal.images) sind NICHT betroffen — die
--    0206-Regel galt nur für die Dokumentation.
--
-- 2) Jeder Lauf von skill_cleanup schreibt eine Zeile in cleanup_runs
--    (wann, woher, was gelöscht wurde). Zeilen älter als 90 Tage gehen
--    im selben Lauf. Keine personenbezogenen Daten, nur Zahlen.
--
-- 3) admin_cleanup_status() fürs Admin-Panel: die letzten Läufe und,
--    falls pg_cron da ist, die eingerichteten Aufträge mit ihrem
--    letzten Ergebnis.
--
-- Prüfstand: supabase/tests/0227_loeschfristen_fotos_protokoll.mjs
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Fotos nach 30 Tagen
-- ─────────────────────────────────────────────────────────────
create or replace function pa_photo_cleanup(p_limit int default 500)
  returns int
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_n int;
begin
  with ends as (
    select g.id as group_id,
           coalesce(
             case when (gi.data ->> 'due') ~ '^\d{4}-\d{2}-\d{2}$'
                  then (gi.data ->> 'due')::date end,
             (r.last_active_at at time zone 'Europe/Berlin')::date
           ) as project_end
      from pa_groups g
      join skill_rooms r on r.id = g.room_id
      left join pa_items gi on gi.group_id = g.id and gi.kind = 'goal' and gi.item_id = 'main'
  ),
  doomed as (
    select i.group_id, i.kind, i.item_id
      from pa_items i
      join ends e on e.group_id = i.group_id
     where i.kind = 'log'
       and jsonb_typeof(i.data -> 'photos') = 'array'
       and jsonb_array_length(i.data -> 'photos') > 0
       and e.project_end + 30 < (now() at time zone 'Europe/Berlin')::date
     limit greatest(1, coalesce(p_limit, 500))
  ),
  done as (
    update pa_items i
       set data    = (i.data - 'photos')
                     || jsonb_build_object('photos_expired', jsonb_array_length(i.data -> 'photos')),
           version = i.version + 1
      from doomed d
     where i.group_id = d.group_id and i.kind = d.kind and i.item_id = d.item_id
    returning i.room_id
  ),
  bumped as (
    update pa_rooms p set rev = p.rev + 1
     where p.room_id in (select distinct room_id from done)
    returning 1
  )
  select count(*) into v_n from done;

  return v_n;
end;
$$;

revoke all on function pa_photo_cleanup(int) from public, anon, authenticated;

comment on function pa_photo_cleanup(int) is
  'Löscht Fotos der Projektarbeit-Dokumentation 30 Tage nach Projektende (Fertig-Datum, '
  'sonst letzte Aktivität im Raum). Läuft in skill_cleanup (0227).';


-- ─────────────────────────────────────────────────────────────
-- 2) Protokoll
-- ─────────────────────────────────────────────────────────────
create table if not exists cleanup_runs (
  id      bigint generated always as identity primary key,
  ran_at  timestamptz not null default now(),
  source  text not null,
  result  jsonb not null
);
create index if not exists cleanup_runs_ran_at_idx on cleanup_runs(ran_at desc);
alter table cleanup_runs enable row level security;
-- Keine Grants: gelesen wird nur über admin_cleanup_status().

comment on table cleanup_runs is
  'Ein Eintrag je Lauf von skill_cleanup (0227): wann, woher (täglich per pg_cron oder '
  'beiläufig), wie viel gelöscht wurde. Nur Zahlen. Hält 90 Tage.';


-- skill_cleanup aus 0209, ergänzt um Fotos und Protokoll.
create or replace function skill_cleanup(p_limit int default 200)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_rooms    int;
  v_logs     int;
  v_signups  int;
  v_cheats   int;
  v_tickets  int;
  v_photos   int;
  v_accounts jsonb;
  v_result   jsonb;
begin
  with doomed as (
    select id from skill_rooms
     where expires_at <= now()
     order by expires_at
     limit greatest(1, coalesce(p_limit, 200))
  )
  delete from skill_rooms r using doomed d where r.id = d.id;
  get diagnostics v_rooms = row_count;

  delete from skill_join_attempts where created_at < now() - interval '1 day';
  get diagnostics v_logs = row_count;

  delete from signup_attempts where created_at < now() - interval '1 day';
  get diagnostics v_signups = row_count;

  delete from cheat_flags where created_at < now() - interval '180 days';
  get diagnostics v_cheats = row_count;

  delete from feedback_tickets where updated_at < now() - interval '365 days';
  get diagnostics v_tickets = row_count;

  v_photos   := pa_photo_cleanup(500);                       -- 0227
  v_accounts := account_lifecycle(50);

  v_result := jsonb_build_object('ok', true, 'rooms', v_rooms, 'attempts', v_logs,
                                 'signups', v_signups, 'cheat_flags', v_cheats,
                                 'tickets', v_tickets, 'photos', v_photos,
                                 'accounts', v_accounts);

  -- 0227: Protokoll. Ohne angemeldeten Aufrufer = pg_cron (bzw. SQL-
  -- Editor), mit = beiläufig über skill_rooms_list.
  insert into cleanup_runs (source, result)
  values (case when auth.uid() is null then 'täglich' else 'beiläufig' end, v_result);
  delete from cleanup_runs where ran_at < now() - interval '90 days';

  return v_result;
end;
$$;

revoke all on function skill_cleanup(int) from public;
grant execute on function skill_cleanup(int) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) Für das Admin-Panel
-- ─────────────────────────────────────────────────────────────
create or replace function admin_cleanup_status()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_runs jsonb;
  v_jobs jsonb := null;
begin
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('ran_at', ran_at, 'source', source, 'result', result)
                            order by ran_at desc), '[]'::jsonb)
    into v_runs
    from (select * from cleanup_runs order by ran_at desc limit 30) x;

  -- pg_cron ist nicht überall aktiv (0081). Nur lesen, wenn es da ist;
  -- dynamisch, damit die Funktion auch ohne das Schema anlegbar ist.
  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'jobname',  j.jobname,
               'schedule', j.schedule,
               'active',   j.active,
               'last_start',  d.start_time,
               'last_status', d.status,
               'last_message', left(d.return_message, 200)
             ) order by j.jobname), '[]'::jsonb)
        from cron.job j
        left join lateral (
          select start_time, status, return_message
            from cron.job_run_details r
           where r.jobid = j.jobid
           order by start_time desc limit 1
        ) d on true
    $q$ into v_jobs;
  end if;

  return jsonb_build_object('ok', true, 'runs', v_runs, 'cron', v_jobs);
end;
$$;

revoke all on function admin_cleanup_status() from public, anon;
grant execute on function admin_cleanup_status() to authenticated;
