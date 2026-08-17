-- ══════════════════════════════════════════════════════════════
-- Migration 0082 — MPSkills: Räume im Admin-Panel (Stufe 7)
-- ══════════════════════════════════════════════════════════════
-- Eine einzige Funktion: die Übersicht, welche Räume in einer
-- Schule laufen. Bisher sieht jede Lehrkraft nur ihre eigenen
-- (skill_rooms_list, owner_id = auth.uid()), und niemand sieht,
-- was insgesamt los ist.
--
-- ── Warum nur LESEN ───────────────────────────────────────────
-- Kein Löschen fremder Räume, kein Eingreifen. Zwei Gründe, und
-- beide sind Absicht:
--
--   1) Ein Raum ist Unterricht. Wer ihn löscht, löscht die Arbeit
--      einer Klasse — das darf nur, wer sie kennt, und das ist die
--      Lehrkraft. Ein Admin, der aus der Ferne aufräumt, trifft
--      irgendwann die falsche Stunde.
--   2) Verwaiste Räume räumen sich selbst weg. Seit 0081 löscht
--      skill_cleanup 60 Tage nach der letzten Aktivität — auch die
--      einer Lehrkraft, die die Schule längst verlassen hat. Es
--      gibt also gar kein Aufräum-Problem, das ein Knopf hier
--      lösen müsste.
--
-- Sollte sich das im Betrieb als zu eng erweisen, ist ein
-- skill_room_admin_delete eine kurze Funktion — aber dann als
-- bewusste Entscheidung und nicht als Nebenprodukt einer Übersicht.
--
-- ── Schul-Trennung ────────────────────────────────────────────
-- Dieselbe Regel wie überall seit 0053: Volladmin sieht alle
-- Schulen, Schuladmin nur die eigene. Die Prüfung steht HIER und
-- nicht in einer Policy, weil skill_rooms RLS ohne Policy hat
-- (0079) — der Zugriff läuft ausschließlich über Funktionen.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- skill_rooms_overview
-- ─────────────────────────────────────────────────────────────
-- p_school null = die eigene Schule (Schuladmin) bzw. alle
-- (Volladmin). Gibt ein Volladmin eine Schule an, wird nur diese
-- gezeigt; ein Schuladmin kann den Parameter setzen, wie er will —
-- v_school überschreibt ihn.
--
-- Der TOKEN taucht hier nirgends auf (Regel 3 aus 0079). Auch
-- Admins bekommen ihn nicht: sie würden damit als Teilnehmer in
-- einem fremden Raum sitzen, und dafür gibt es die Beamer-Ansicht
-- der Lehrkraft.
--
-- Die NAMEN der Teilnehmer stehen ebenfalls nicht drin, nur ihre
-- Anzahl. Eine Übersicht beantwortet „was läuft hier", nicht „wer
-- sitzt da" — und je weniger Stellen Klarnamen von Minderjährigen
-- ausliefern, desto besser.
create or replace function skill_rooms_overview(p_school uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_school uuid;
  v_out    jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  -- Volladmin darf wählen (auch „alle" = null), Schuladmin nicht.
  if is_superadmin() then
    v_school := p_school;
  else
    v_school := my_school_id();
    if v_school is null then
      return jsonb_build_object('ok', false, 'error', 'no_school');
    end if;
  end if;

  select coalesce(jsonb_agg(x order by x_active desc), '[]'::jsonb)
    into v_out
    from (
      select r.last_active_at as x_active,
             jsonb_build_object(
               'code',        r.code,
               'title',       r.title,
               'tool_id',     r.tool_id,
               'tool_title',  t.title,
               'tool_icon',   t.icon,
               'school_id',   r.school_id,
               'school_name', s.name,
               'owner',       coalesce(p.display_name, p.account_name, '—'),
               'owner_id',    r.owner_id,
               'is_test',     r.is_test,
               'ask_names',   r.ask_names,
               'join_open',   r.join_open,
               'created_at',    r.created_at,
               'last_active_at', r.last_active_at,
               'expires_at',  r.expires_at,
               'expired',     (r.expires_at <= now()),
               'people',  (select count(*) from skill_participants sp where sp.room_id = r.id),
               'online',  (select count(*) from skill_participants sp
                            where sp.room_id = r.id
                              and sp.last_seen_at > now() - interval '90 seconds'),
               'blocked', (select count(*) from skill_participants sp
                            where sp.room_id = r.id and sp.blocked),
               'entries', (select count(*) from skill_room_entries e where e.room_id = r.id)
             ) as x
        from skill_rooms r
        join skill_tools t on t.id = r.tool_id
        left join profiles p on p.id = r.owner_id
        left join schools  s on s.id = r.school_id
       where v_school is null or r.school_id = v_school
    ) q;

  return jsonb_build_object('ok', true, 'rooms', v_out, 'school_id', v_school);
end;
$$;

revoke all on function skill_rooms_overview(uuid) from public;
grant execute on function skill_rooms_overview(uuid) to authenticated;

comment on function skill_rooms_overview(uuid) is
  'Räume einer Schule für das Admin-Panel — nur lesend, ohne Token und ohne Teilnehmernamen. '
  'Volladmin sieht alle Schulen, Schuladmin die eigene.';
