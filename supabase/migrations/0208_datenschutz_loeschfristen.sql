-- ══════════════════════════════════════════════════════════════
-- Migration 0208 — Datenschutz: Löschfristen für Protokolle
-- ══════════════════════════════════════════════════════════════
-- Was nur für eine Bremse oder eine Nachfrage gebraucht wird, darf
-- nicht für immer liegen bleiben (Art. 5 Abs. 1 lit. e DSGVO,
-- Speicherbegrenzung). Bisher:
--
--   signup_attempts      IP je Fehlversuch — wurde NIE gelöscht (0018)
--   skill_join_attempts  IP je Raumbeitritt — 7 Tage (0081)
--   cheat_flags          Verdachtsfälle je Konto — nie gelöscht (0016)
--   feedback_tickets     Freitext mit Name — nie gelöscht (0179)
--
-- Neu in skill_cleanup (läuft täglich 03:30 UTC per pg_cron und
-- beiläufig, siehe 0081):
--
--   signup_attempts      nach 1 Tag   — das Limit rechnet über 1 Stunde
--   skill_join_attempts  nach 1 Tag   — ebenso
--   cheat_flags          nach 180 Tagen
--   feedback_tickets     nach 365 Tagen (letzte Änderung)
--
-- Die Fristen stehen nur hier. Wer sie ändert, ändert auch den Satz
-- dazu in der Datenschutzerklärung der Schule.
--
-- Kein DROP — create or replace (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

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
begin
  with doomed as (
    select id from skill_rooms
     where expires_at <= now()
     order by expires_at
     limit greatest(1, coalesce(p_limit, 200))
  )
  delete from skill_rooms r using doomed d where r.id = d.id;
  get diagnostics v_rooms = row_count;

  -- IP-Protokolle: beide Limits rechnen über eine Stunde, ein Tag
  -- Vorrat reicht.
  delete from skill_join_attempts where created_at < now() - interval '1 day';
  get diagnostics v_logs = row_count;

  delete from signup_attempts where created_at < now() - interval '1 day';
  get diagnostics v_signups = row_count;

  delete from cheat_flags where created_at < now() - interval '180 days';
  get diagnostics v_cheats = row_count;

  delete from feedback_tickets where updated_at < now() - interval '365 days';
  get diagnostics v_tickets = row_count;

  return jsonb_build_object('ok', true, 'rooms', v_rooms, 'attempts', v_logs,
                            'signups', v_signups, 'cheat_flags', v_cheats,
                            'tickets', v_tickets);
end;
$$;

revoke all on function skill_cleanup(int) from public;
grant execute on function skill_cleanup(int) to service_role;

comment on function skill_cleanup(int) is
  'Löscht abgelaufene Räume samt allem, was daran hängt, und alte Protokolle: '
  'IP-Logs nach 1 Tag, cheat_flags nach 180, feedback_tickets nach 365 Tagen (0208). '
  'Zwei Auslöser: beiläufig beim Zugriff der Lehrkraft (gedrosselt) und täglich per pg_cron.';
