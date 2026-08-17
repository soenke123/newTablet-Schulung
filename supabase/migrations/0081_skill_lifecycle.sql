-- ══════════════════════════════════════════════════════════════
-- Migration 0081 — MPSkills: Lebenszyklus + Moderation (Stufe 5)
-- ══════════════════════════════════════════════════════════════
-- Was 0079 versprochen und 0080 offengelassen hat:
--
--   · Verlängern         skill_room_extend
--   · Aufräumen          skill_cleanup, zweifach ausgelöst
--   · Tablets sperren    skill_participants.blocked
--   · Schimpfwörter      jetzt auch auf Beitragstexte
--
-- Beiträge ausblenden ist schon in 0080 gelandet (skill_room_entry_hide)
-- — die Spalte gehörte ohnehin in die Tabelle, und der Stufenplan-Test
-- für Stufe 4 verlangte es.
--
-- ── Warum das Aufräumen dringend ist ──────────────────────────
-- expires_at sperrt seit 0079 den ZUGANG, löscht aber nichts. Ohne
-- diese Migration sammeln sich in skill_participants dauerhaft
-- Klarnamen von Schülerinnen und Schülern an — genau die Daten, die
-- laut Konzept 60 Tage nach der letzten Aktivität verschwunden sein
-- sollen. Das ist der Grund, warum diese Stufe nicht warten darf,
-- sobald der erste echte Kurs mit MPSkills arbeitet.
--
-- Die drei Regeln des Sicherheitsmodells gelten unverändert (0079):
-- anon fasst keine Tabelle an · keine anon-Funktion nimmt eine Raum-
-- oder Teilnehmer-ID von außen, die erste Zeile löst den Token auf ·
-- der Token verlässt die Datenbank nicht.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Tablets sperren
-- ─────────────────────────────────────────────────────────────
-- Ein Gerät, das den Unterricht stört, muss ruhiggestellt werden
-- können, ohne dass die Lehrkraft den ganzen Raum schließt.
--
-- Gesperrt heißt: lesen nein, schreiben nein, zustimmen nein. Die
-- bisherigen Beiträge bleiben stehen — sie gehören zum Gespräch, und
-- was davon stört, blendet man einzeln aus (0080). Sperren ist eine
-- Aussage über das GERÄT, Ausblenden eine über einen Beitrag; wer
-- beides zusammenwirft, kann keines von beidem zurücknehmen.
--
-- Umkehrbar, wie alles Moderative hier.
alter table skill_participants
  add column if not exists blocked    boolean not null default false;
alter table skill_participants
  add column if not exists blocked_at timestamptz;

comment on column skill_participants.blocked is
  'Von der Lehrkraft stillgelegt. Kein Lesen, kein Schreiben, kein Zustimmen — die schon '
  'geschriebenen Beiträge bleiben aber stehen. Umkehrbar.';


-- ─────────────────────────────────────────────────────────────
-- 2) Schimpfwörter in Beitragstexten
-- ─────────────────────────────────────────────────────────────
-- ⚠️ NICHT contains_blacklisted_word (0003) benutzen. Die prüft per
-- TEILSTRING, und das ist für einen Kontonamen richtig — er wird
-- einmal gewählt, eine Absage kostet einen zweiten Versuch. Für
-- freien Text ist es unbrauchbar:
--
--   'ass'  steckt in  Klasse · Klassenraum · Kasse
--   'anal' steckt in  Analyse · analog · Kanal
--   'heil' steckt in  heilen · Heiligabend · unheilbar
--   'dick' ist selbst ein gewöhnliches deutsches Wort
--
-- Eine Wortwolke im Unterricht, die „Klasse" ablehnt, ist kaputt.
--
-- Die Abwägung ist unsymmetrisch, und daraus folgt die Regel: ein
-- durchgerutschtes Schimpfwort kostet die Lehrkraft EINEN Klick auf
-- „Ausblenden". Ein fälschlich abgewiesenes „Klasse" kostet eine
-- Schülerin ihren Beitrag, mitten in der Stunde, mit einer Meldung,
-- auf die sie nicht reagieren kann. Also lieber durchlassen.
--
-- Deshalb wird der Text in Wörter zerlegt, und ein Wort gilt als
-- Treffer, wenn es
--   · GENAU einem Listeneintrag entspricht, oder
--   · einen Listeneintrag von mindestens 6 Zeichen enthält.
--
-- Die zweite Bedingung fängt Beugungen und Zusammensetzungen der
-- eindeutigen Wörter ('arschloch', 'scheisse', 'wichser',
-- 'schwuchtel', 'missgeburt'), ohne dass die kurzen und mehrdeutigen
-- ('ass', 'sex', 'anal', 'heil', 'dick') jemals als Teilstring
-- greifen.
--
-- Was das bewusst NICHT fängt: 'fickt' (Liste hat 'fick'/'ficken'),
-- 'Nazis' (Liste hat 'nazi'), 'Arschgesicht' wird dagegen über
-- 'arschloch'… nein, auch das nicht — es fängt nur, was oben steht.
-- Das ist der Preis, und er ist der richtige: die Lehrkraft sieht
-- jeden Beitrag am Beamer, bevor er besprochen wird.
create or replace function contains_blacklisted_text(input text)
  returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select exists (
    select 1
      from regexp_split_to_table(
             regexp_replace(
               translate(
                 replace(replace(replace(replace(lower(coalesce(input, '')),
                   'ä', 'ae'),
                   'ö', 'oe'),
                   'ü', 'ue'),
                   'ß', 'ss'),
                 '$@013457',
                 'saoieast'
               ),
               '[^a-z0-9]+', ' ', 'g'
             ),
             ' '
           ) as tok
      join blacklist_words w
        on tok = w.word
        or (length(w.word) >= 6 and tok like '%' || w.word || '%')
     where tok <> ''
  );
$$;

revoke all on function contains_blacklisted_text(text) from public;
grant execute on function contains_blacklisted_text(text) to anon, authenticated, service_role;

comment on function contains_blacklisted_text(text) is
  'Schimpfwortprüfung für FREIEN TEXT — mit Wortgrenzen, anders als contains_blacklisted_word. '
  'Kurze mehrdeutige Listeneinträge (ass, anal, heil) greifen nur als ganzes Wort, sonst '
  'scheiterte „Klasse" und „Analyse". Bewusst durchlässig: das Ausblenden ist das Netz.';


-- ─────────────────────────────────────────────────────────────
-- 3) Aufräumen
-- ─────────────────────────────────────────────────────────────
-- Löschen heißt löschen: Raum, Teilnehmer, Beiträge, Stimmen. Das
-- erledigt `on delete cascade` — kein Aufräumen von Hand, das man an
-- einer Tabelle vergessen könnte, wenn Stufe 6 eine neue anlegt.
--
-- Die Token der Schüler laufen danach in skill_view und bekommen dort
-- 'room_gone', also eine Meldung statt eines Fehlers (0079).
--
-- p_limit deckelt einen Lauf. Der Grund ist der beiläufige Aufruf
-- weiter unten: er hängt an einer Lehrkraft, die gerade ihre Räume
-- öffnet, und darf ihr nicht sekundenlang die Seite anhalten, weil
-- zufällig ein Jahrgang gleichzeitig abgelaufen ist.
create or replace function skill_cleanup(p_limit int default 200)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_rooms int;
  v_logs  int;
begin
  with doomed as (
    select id from skill_rooms
     where expires_at <= now()
     order by expires_at
     limit greatest(1, coalesce(p_limit, 200))
  )
  delete from skill_rooms r using doomed d where r.id = d.id;
  get diagnostics v_rooms = row_count;

  -- Das IP-Protokoll des Beitritts wächst sonst unbegrenzt, genau wie
  -- signup_attempts. Sieben Tage sind großzügig für ein Limit, das
  -- über eine Stunde rechnet.
  delete from skill_join_attempts where created_at < now() - interval '7 days';
  get diagnostics v_logs = row_count;

  return jsonb_build_object('ok', true, 'rooms', v_rooms, 'attempts', v_logs);
end;
$$;

revoke all on function skill_cleanup(int) from public;
grant execute on function skill_cleanup(int) to service_role;

comment on function skill_cleanup(int) is
  'Löscht abgelaufene Räume samt allem, was daran hängt, und altes IP-Protokoll. '
  'Zwei Auslöser: beiläufig beim Zugriff der Lehrkraft (gedrosselt) und täglich per pg_cron.';


-- Merker für die Drosselung. Eine Tabelle mit genau einer Zeile —
-- ein Vorschlaghammer für eine Zahl, aber die Alternative wäre eine
-- Konstante im Code, die sich zwischen zwei Anfragen nichts merkt.
create table if not exists skill_maintenance (
  id           boolean primary key default true,
  last_run_at  timestamptz not null default 'epoch',
  constraint skill_maintenance_single check (id)
);

alter table skill_maintenance enable row level security;
grant select, insert, update on skill_maintenance to service_role;

insert into skill_maintenance (id) values (true) on conflict (id) do nothing;


-- Der beiläufige Lauf. Höchstens einmal pro Stunde, und die
-- Drosselung steht in der WHERE-Klausel und nicht im Aufrufer —
-- dieselbe Überlegung wie bei skill_touch und last_seen_at in 0079:
-- so kann kein Aufrufer sie vergessen.
--
-- Der UPDATE ist zugleich die Sperre: kommen zwei Lehrkräfte
-- gleichzeitig an, gewinnt genau eine die Zeile und die andere sieht
-- nichts zu tun.
create or replace function skill_cleanup_maybe()
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_hit boolean;
begin
  update skill_maintenance
     set last_run_at = now()
   where id and last_run_at < now() - interval '1 hour'
  returning true into v_hit;

  if v_hit then
    perform skill_cleanup(200);
  end if;
end;
$$;

revoke all on function skill_cleanup_maybe() from public;

comment on function skill_cleanup_maybe() is
  'Beiläufiger Aufräum-Lauf, höchstens stündlich. Kein Grant — wird nur aus '
  'skill_rooms_list gerufen.';


-- ─────────────────────────────────────────────────────────────
-- 4) Der tägliche Lauf
-- ─────────────────────────────────────────────────────────────
-- pg_cron ist in Supabase vorhanden, aber nicht überall aktiviert.
-- Deshalb wird geprüft statt vorausgesetzt: fehlt die Erweiterung,
-- läuft die Migration trotzdem durch und es bleibt beim beiläufigen
-- Lauf — der räumt genauso vollständig auf, nur eben erst, wenn
-- jemand die Seite benutzt.
--
-- Genau das ist auch der Grund, warum es den täglichen Lauf
-- zusätzlich gibt: die Ferien sind sechs Wochen lang, in denen
-- niemand eine Lehrerseite öffnet — und die 60-Tage-Frist läuft
-- weiter.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- unschedule/schedule statt „if not exists": ein zweiter Lauf
    -- dieser Migration soll den Auftrag ersetzen und nicht neben ihn
    -- einen zweiten legen. Erst prüfen, dann abbestellen — unschedule
    -- auf einen unbekannten Namen ist ein Fehler und würde die ganze
    -- Migration abbrechen.
    if exists (select 1 from cron.job where jobname = 'mpskills_cleanup') then
      perform cron.unschedule('mpskills_cleanup');
    end if;
    perform cron.schedule('mpskills_cleanup', '30 3 * * *',
                          $job$select skill_cleanup(5000);$job$);
    raise notice 'MPSkills: täglicher Aufräum-Lauf eingerichtet (03:30 UTC).';
  else
    raise notice 'MPSkills: pg_cron nicht aktiv — es bleibt beim beiläufigen Aufräumen. '
                 'Zum Nachrüsten in Supabase die Erweiterung pg_cron aktivieren und '
                 'diese Migration erneut ausführen.';
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 5) Verlängern
-- ─────────────────────────────────────────────────────────────
-- Genau dafür ist expires_at seit 0079 eine echte Spalte und kein
-- Ausdruck „last_active_at + 60 Tage": sonst ließe sich Verlängern
-- nur durch Fälschen der letzten Aktivität bauen.
--
-- last_active_at bleibt hier bewusst UNBERÜHRT. Die beiden Spalten
-- beantworten zwei verschiedene Fragen — „wann war hier zuletzt
-- jemand" und „wie lange gilt das noch" —, und ein Verlängern ist
-- keine Antwort auf die erste. Die Raumliste zeigt beides, und ein
-- Raum, den seit Wochen niemand betreten hat, soll das auch nach dem
-- Verlängern noch sagen.
create or replace function skill_room_extend(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_new  timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Auch ein abgelaufener Raum lässt sich zurückholen, solange er noch
  -- da ist: zwischen Ablauf und Aufräum-Lauf liegt bis zu ein Tag, und
  -- in dem Fenster ist „ich hätte den doch noch gebraucht" der
  -- wahrscheinlichste Grund, hier zu klicken.
  v_new := greatest(now(), v_room.expires_at) + interval '60 days';

  update skill_rooms set expires_at = v_new where id = v_room.id;

  return jsonb_build_object('ok', true, 'expires_at', v_new,
                            'revived', (v_room.expires_at <= now()));
end;
$$;

revoke all on function skill_room_extend(text) from public;
grant execute on function skill_room_extend(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) Ein Tablet sperren
-- ─────────────────────────────────────────────────────────────
-- Die Teilnehmer-ID kommt hier von außen — anders als bei den
-- anon-Funktionen ist das erlaubt, denn der Aufrufer weist sich mit
-- seinem Konto aus. Sie gilt trotzdem nur zusammen mit dem
-- aufgelösten Raum: `and room_id = v_room.id`. Eine fremde
-- Teilnehmerzeile ist damit nicht auffindbar.
create or replace function skill_room_set_blocked(
  p_code        text,
  p_participant uuid,
  p_blocked     boolean default true
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_on   boolean := coalesce(p_blocked, true);
  v_n    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update skill_participants
     set blocked    = v_on,
         blocked_at = case when v_on then now() else null end
   where id = p_participant and room_id = v_room.id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'blocked', v_on);
end;
$$;

revoke all on function skill_room_set_blocked(text, uuid, boolean) from public;
grant execute on function skill_room_set_blocked(text, uuid, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Die Sperre durchsetzen
-- ─────────────────────────────────────────────────────────────
-- Vier Funktionen sehen den Token, vier Funktionen prüfen die Sperre.
-- Ein Riegel nur beim Schreiben reichte nicht: gesperrt heißt auch,
-- nicht mehr mitzulesen — sonst sitzt jemand, dem gerade das Tablet
-- weggenommen wurde, weiter im Gespräch.
--
-- Die Signatur wird trotzdem weiter beantwortet? Nein — auch
-- skill_sig antwortet 'blocked'. Der Poller im Gerät sieht das und
-- zeigt eine klare Meldung; er hört aber NICHT auf zu fragen, damit
-- das Aufheben der Sperre von selbst ankommt.

create or replace function skill_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_room  skill_rooms;
  v_lim   jsonb;
  v_phase int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  v_lim   := skill_limits(v_room.id);
  select coalesce(s.phase, 1) into v_phase
    from skill_rooms r left join skill_room_state s on s.room_id = r.id
   where r.id = v_room.id;

  return jsonb_build_object(
    'ok',      true,
    'room',    skill_room_json(v_room.id),
    'people',  skill_people_json(v_room.id, v_p.id),
    'state',   skill_state_json(v_room.id),
    'entries', skill_entries_json(v_room.id, v_p.id, false),
    'limits',  v_lim,
    'role',    'participant',
    'me', jsonb_build_object(
            'seat',  v_p.seat,
            'name',  coalesce(v_p.name, 'Tablet ' || v_p.seat),
            'named', (v_p.name is not null),
            'entries_used', (select count(*) from skill_room_entries e
                              where e.room_id = v_room.id and e.participant_id = v_p.id),
            'may_write', skill_may_write(v_lim, v_phase)
          )
  );
end;
$$;

revoke all on function skill_view(text) from public;
grant execute on function skill_view(text) to anon, authenticated;


create or replace function skill_sig(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  return jsonb_build_object('ok', true, 'sig', skill_sig_of(v_room.id));
end;
$$;

revoke all on function skill_sig(text) from public;
grant execute on function skill_sig(text) to anon, authenticated;


-- Schreiben: Sperre + Schimpfwortprüfung. Beides steht NUR hier und
-- nicht in skill_room_entry_add — die Lehrkraft ist weder gesperrt
-- noch braucht sie einen Wortfilter.
create or replace function skill_entry_upsert(
  p_token   text,
  p_payload jsonb,
  p_id      uuid default null,
  p_kind    text default 'entry'
)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_room  skill_rooms;
  v_lim   jsonb;
  v_phase int;
  v_max   int;
  v_used  int;
  v_err   text;
  v_pl    jsonb := p_payload;
  v_field text;
  v_entry skill_room_entries;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  v_lim := skill_limits(v_room.id);
  select coalesce(s.phase, 1) into v_phase
    from skill_rooms r left join skill_room_state s on s.room_id = r.id
   where r.id = v_room.id;

  if not skill_may_write(v_lim, v_phase) then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  -- `select *` und nicht `q.p_payload, q.err`: die Funktion hat einen
  -- OUT-Parameter, der genauso heißt wie ein Parameter DIESER Funktion,
  -- und PL/pgSQL setzt Bezeichner in SQL durch Variablen. Die
  -- Positionsform lässt gar keine Verwechslung zu.
  select * into v_pl, v_err from skill_check_payload(v_pl, v_lim);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  -- Schimpfwortprüfung auf dem Textfeld, das das Werkzeug angemeldet
  -- hat. Kein Textfeld = nichts zu prüfen (eine Abstimmung schickt
  -- eine Zahl). Mit Wortgrenzen, siehe Abschnitt 2 dieser Datei —
  -- contains_blacklisted_word wäre hier der falsche Aufruf.
  v_field := nullif(v_lim->>'text_field', '');
  if v_field is not null and contains_blacklisted_text(v_pl->>v_field) then
    return jsonb_build_object('ok', false, 'error', 'text_blocked');
  end if;

  if char_length(coalesce(p_kind, '')) not between 1 and 24 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Ändern: die Beitrags-ID gilt nur zusammen mit Raum UND
  -- Teilnehmer. Beides aus der Token-Auflösung, keines von außen.
  if p_id is not null then
    select * into v_entry from skill_room_entries
     where id = p_id and room_id = v_room.id and participant_id = v_p.id;
    if v_entry.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    update skill_room_entries
       set payload = v_pl, updated_at = now()
     where id = v_entry.id;

    perform skill_touch(v_room.id);
    return jsonb_build_object('ok', true, 'updated', true, 'id', v_entry.id);
  end if;

  -- Anlegen: Kontingent. Gezählt werden auch ausgeblendete — sonst
  -- schafft Moderation neuen Platz, und wer ausgeblendet wird,
  -- bekäme einen Zettel geschenkt.
  v_max := coalesce(nullif(v_lim->>'max_entries', '')::int, 0);
  if v_max > 0 then
    select count(*) into v_used from skill_room_entries
     where room_id = v_room.id and participant_id = v_p.id;
    if v_used >= v_max then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded', 'max', v_max);
    end if;
  end if;

  insert into skill_room_entries (room_id, participant_id, kind, payload)
  values (v_room.id, v_p.id, coalesce(p_kind, 'entry'), v_pl)
  returning * into v_entry;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'updated', false, 'id', v_entry.id);
end;
$$;

revoke all on function skill_entry_upsert(text, jsonb, uuid, text) from public;
grant execute on function skill_entry_upsert(text, jsonb, uuid, text) to anon, authenticated;


create or replace function skill_entry_delete(p_token text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_room  skill_rooms;
  v_lim   jsonb;
  v_phase int;
  v_n     int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  v_lim := skill_limits(v_room.id);
  select coalesce(s.phase, 1) into v_phase
    from skill_rooms r left join skill_room_state s on s.room_id = r.id
   where r.id = v_room.id;

  if not skill_may_write(v_lim, v_phase) then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  delete from skill_room_entries
   where id = p_id and room_id = v_room.id and participant_id = v_p.id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function skill_entry_delete(text, uuid) from public;
grant execute on function skill_entry_delete(text, uuid) to anon, authenticated;


create or replace function skill_vote_toggle(p_token text, p_entry uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_room  skill_rooms;
  v_lim   jsonb;
  v_entry skill_room_entries;
  v_n     int;
  v_on    boolean;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  v_lim := skill_limits(v_room.id);
  if coalesce((v_lim->>'votes')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'error', 'votes_disabled');
  end if;

  select * into v_entry from skill_room_entries
   where id = p_entry and room_id = v_room.id and not hidden;
  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_entry.participant_id = v_p.id
     and coalesce((v_lim->>'self_vote')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'own_entry');
  end if;

  delete from skill_room_votes
   where entry_id = v_entry.id and participant_id = v_p.id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    insert into skill_room_votes (entry_id, participant_id)
    values (v_entry.id, v_p.id);
    v_on := true;
  else
    v_on := false;
  end if;

  return jsonb_build_object(
    'ok', true, 'voted', v_on,
    'votes', (select count(*) from skill_room_votes where entry_id = v_entry.id)
  );
end;
$$;

revoke all on function skill_vote_toggle(text, uuid) from public;
grant execute on function skill_vote_toggle(text, uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) Gesperrte sichtbar machen
-- ─────────────────────────────────────────────────────────────
-- Die Anwesenheitsliste bekommt `blocked` — sonst hätte die Lehrkraft
-- keinen Knopf, mit dem sie die Sperre wieder aufhebt, und die
-- Klasse sähe nicht, warum ein Tablet stumm ist.
--
-- `online` wird für Gesperrte bewusst NICHT unterdrückt: dass ein
-- gesperrtes Gerät weiter fragt, ist die Information, die zählt.
create or replace function skill_people_json(p_room uuid, p_me uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(x order by x_seat), '[]'::jsonb)
    from (
      select p.seat as x_seat,
             jsonb_build_object(
               'id',      p.id,
               'seat',    p.seat,
               'name',    coalesce(p.name, 'Tablet ' || p.seat),
               'named',   (p.name is not null),
               'is_me',   (p_me is not null and p.id = p_me),
               'online',  (p.last_seen_at > now() - interval '90 seconds'),
               'blocked', p.blocked,
               'joined_at', p.joined_at
             ) as x
        from skill_participants p
       where p.room_id = p_room
    ) t;
$$;

revoke all on function skill_people_json(uuid, uuid) from public;


-- Gesperrte in die Signatur: sonst käme das Sperren erst beim
-- nächsten anderen Ereignis am Beamer an — und das Aufheben womöglich
-- gar nicht.
create or replace function skill_sig_of(p_room uuid)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select concat_ws('.',
    (select count(*) from skill_participants p where p.room_id = p_room),
    (select count(*) from skill_participants p
      where p.room_id = p_room and p.last_seen_at > now() - interval '90 seconds'),
    (select count(*) from skill_participants p where p.room_id = p_room and p.blocked),
    (select case when r.join_open then '1' else '0' end from skill_rooms r where r.id = p_room),
    (select extract(epoch from r.last_active_at)::bigint from skill_rooms r where r.id = p_room),
    (select count(*) from skill_room_entries e where e.room_id = p_room),
    (select coalesce(extract(epoch from max(e.updated_at))::bigint, 0)
       from skill_room_entries e where e.room_id = p_room),
    (select count(*) from skill_room_votes v
       join skill_room_entries e on e.id = v.entry_id where e.room_id = p_room),
    (select coalesce(s.phase, 1) from skill_rooms r
       left join skill_room_state s on s.room_id = r.id where r.id = p_room),
    (select coalesce(extract(epoch from s.updated_at)::bigint, 0)
       from skill_room_state s where s.room_id = p_room)
  );
$$;

revoke all on function skill_sig_of(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 9) Der Wiedereintritt gesperrter Geräte
-- ─────────────────────────────────────────────────────────────
-- Ein angemeldeter Teilnehmer findet über seine user_id zurück in
-- den Raum (0079) — auch als gesperrter. Das ist richtig so: die
-- Sperre gehört zum Platz, nicht zum Token, und wer sie umgehen will,
-- indem er neu beitritt, soll denselben gesperrten Platz wiederfinden.
--
-- Ohne Anmeldung geht das nicht: wer den Gerätespeicher leert und neu
-- scannt, bekommt einen neuen Platz. Das ist die bekannte Grenze des
-- anonymen Beitritts (Konzept Abschnitt 06) und nicht mit dieser
-- Migration zu lösen — dagegen hilft nur „Beitritt schließen".
create or replace function skill_room_join(
  p_code    text,
  p_name    text default null,
  p_user_id uuid default null
)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_room  skill_rooms;
  v_tool  skill_tools;
  v_p     skill_participants;
  v_name  text;
  v_count int;
  v_seat  int;
  v_token text;
begin
  -- Sperre auf der Raumzeile: ab hier zählt und sitzt nur einer
  -- gleichzeitig.
  select * into v_room from skill_rooms
   where code = upper(btrim(p_code)) for update;
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_expired');
  end if;

  select * into v_tool from skill_tools where id = v_room.tool_id;

  -- Wiedereintritt eines angemeldeten Teilnehmers: derselbe Platz,
  -- derselbe Token, kein zweiter Sitz. Das läuft VOR der Prüfung auf
  -- join_open und auf „voll" — wer schon drin ist, kommt auch dann
  -- zurück, wenn die Lehrkraft inzwischen zugemacht hat.
  if p_user_id is not null then
    select * into v_p from skill_participants
     where room_id = v_room.id and user_id = p_user_id;
    if v_p.id is not null then
      -- Gesperrt bleibt gesperrt. Die Antwort ist trotzdem ein
      -- Erfolg: das Gerät bekommt seinen Token und läuft dann in die
      -- klare Meldung von skill_view, statt hier ohne Erklärung
      -- abgewiesen zu werden.
      update skill_participants set last_seen_at = now() where id = v_p.id;
      return jsonb_build_object(
        'ok', true, 'rejoined', true,
        'token', v_p.token, 'seat', v_p.seat,
        'name', coalesce(v_p.name, 'Tablet ' || v_p.seat),
        'blocked', v_p.blocked,
        'room', skill_room_json(v_room.id)
      );
    end if;
  end if;

  if not v_room.join_open then
    return jsonb_build_object('ok', false, 'error', 'join_closed');
  end if;

  select count(*), coalesce(max(seat), 0)
    into v_count, v_seat
    from skill_participants where room_id = v_room.id;

  if v_count >= v_tool.max_participants then
    return jsonb_build_object('ok', false, 'error', 'room_full',
                              'max', v_tool.max_participants);
  end if;

  -- Im anonymen Raum wird ein mitgeschickter Name verworfen und nicht
  -- etwa beanstandet: „anonym" ist eine Eigenschaft des Raums, keine
  -- Eingabe des Geräts.
  v_name := case when v_room.ask_names
                 then nullif(btrim(coalesce(p_name, '')), '')
                 else null end;
  if v_room.ask_names and v_name is null then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  if v_name is not null and char_length(v_name) > 24 then
    return jsonb_build_object('ok', false, 'error', 'name_too_long');
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_seat  := v_seat + 1;

  insert into skill_participants (room_id, token, seat, name, user_id)
  values (v_room.id, v_token, v_seat, v_name, p_user_id)
  returning * into v_p;

  perform skill_touch(v_room.id);

  return jsonb_build_object(
    'ok', true, 'rejoined', false,
    'token', v_p.token, 'seat', v_p.seat,
    'name', coalesce(v_p.name, 'Tablet ' || v_p.seat),
    'blocked', false,
    'room', skill_room_json(v_room.id)
  );
end;
$$;

revoke all on function skill_room_join(text, text, uuid) from public;
grant execute on function skill_room_join(text, text, uuid) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 10) Die Raumliste räumt beiläufig auf
-- ─────────────────────────────────────────────────────────────
-- Der zweite Auslöser aus Konzept Abschnitt 06. Hier und nicht in
-- skill_room_get: die Liste wird einmal beim Öffnen der Seite
-- geholt, die Ansicht dagegen im Sekundentakt vom Beamer — und ein
-- Aufräum-Lauf gehört nicht in eine Schleife, auch nicht gedrosselt.
--
-- Neu in der Zeile außerdem `blocked`: die Raumliste ist der Ort, an
-- dem eine Lehrkraft am nächsten Tag noch sieht, dass sie gestern ein
-- Tablet stillgelegt hat — und das gehört nicht vergessen.
create or replace function skill_rooms_list()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_rooms jsonb;
  v_tools jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;

  -- Vor dem Lesen, nicht danach: sonst stünden die gerade gelöschten
  -- Räume noch in der Antwort, die die Löschung ausgelöst hat.
  perform skill_cleanup_maybe();

  select coalesce(jsonb_agg(x order by x_test, x_active desc), '[]'::jsonb)
    into v_rooms
    from (
      select r.is_test as x_test, r.last_active_at as x_active,
             skill_room_json(r.id)
               || jsonb_build_object(
                    'last_active_at', r.last_active_at,
                    'expired',        (r.expires_at <= now()),
                    'people',  (select count(*) from skill_participants p where p.room_id = r.id),
                    'online',  (select count(*) from skill_participants p
                                 where p.room_id = r.id
                                   and p.last_seen_at > now() - interval '90 seconds'),
                    'blocked', (select count(*) from skill_participants p
                                 where p.room_id = r.id and p.blocked),
                    'entries', (select count(*) from skill_room_entries e where e.room_id = r.id)
                  ) as x
        from skill_rooms r
       where r.owner_id = v_user
    ) t;

  select coalesce(jsonb_object_agg(t.id, jsonb_build_object(
           'title', t.title, 'icon', t.icon, 'active', t.active,
           'folder', t.folder,
           'limits', t.limits,
           'multi_room', t.multi_room,
           'max_rooms', t.max_rooms,
           'live', (select count(*) from skill_rooms r
                     where r.owner_id = v_user and r.tool_id = t.id
                       and r.is_test = false and r.expires_at > now())
         )), '{}'::jsonb)
    into v_tools
    from skill_tools t;

  return jsonb_build_object('ok', true, 'rooms', v_rooms, 'tools', v_tools);
end;
$$;

revoke all on function skill_rooms_list() from public;
grant execute on function skill_rooms_list() to authenticated;
