-- ══════════════════════════════════════════════════════════════
-- Migration 0085 — MPSkills: Raum-Haltbarkeit 60 → 30 Tage
-- ══════════════════════════════════════════════════════════════
-- „60 Tage" stand seit 0079 an drei Stellen, die alle dieselbe Frage
-- beantworten — „wie lange lebt dieser Raum ab jetzt" —, nur zu
-- unterschiedlichen Anlässen: beim Anlegen (Spaltenvorgabe), bei
-- echter Aktivität (skill_touch, skill_room_set_open) und beim
-- manuellen Verlängern (skill_room_extend, 0081). Alle vier werden
-- hier gemeinsam auf 30 Tage gesetzt — sie sind dieselbe Zahl an
-- vier Stellen, nicht vier unabhängige Werte, und 30 ohne die
-- anderen drei zu ändern hätte nur die Neuanlage betroffen: der
-- erste Beitritt hätte den Raum sofort wieder auf 60 Tage gezogen.
--
-- Verlängern bleibt der Weg, einen Raum länger zu behalten — jetzt
-- eben in 30-Tage-Schritten statt in 60. Nichts an der Mechanik
-- ändert sich (greatest(now(), expires_at) + Intervall, auch ein
-- abgelaufener Raum lässt sich zurückholen), nur die Schrittweite.
-- ══════════════════════════════════════════════════════════════

-- 1) Neuanlage (Spaltenvorgabe aus 0079 §2)
alter table skill_rooms
  alter column expires_at set default now() + interval '30 days';

comment on column skill_rooms.expires_at is
  'Ablauffrist, echte Spalte (nicht last_active_at + Intervall) — nur '
  'so ist „Verlängern" ohne Fälschen der letzten Aktivität möglich. '
  'Vorgabe 30 Tage ab Anlage, verlängert sich bei Aktivität '
  '(skill_touch, skill_room_set_open) und manuell (skill_room_extend) '
  'um jeweils 30 Tage.';


-- 2) skill_touch — Neudeklaration aus 0079 §6, nur das Intervall geändert
create or replace function skill_touch(p_room uuid)
  returns void
  security definer
  set search_path = public
  language sql
as $$
  update skill_rooms
     set last_active_at = now(),
         expires_at     = now() + interval '30 days'
   where id = p_room
     and last_active_at < now() - interval '5 minutes';
$$;

revoke all on function skill_touch(uuid) from public;

comment on function skill_touch(uuid) is
  'Setzt Aktivität und Ablauffrist eines Raums zurück, höchstens alle 5 Minuten. '
  'Kein Grant — wird nur aus anderen Funktionen dieser Datei gerufen.';


-- 3) skill_room_set_open — Neudeklaration aus 0079 §12, nur das Intervall geändert
create or replace function skill_room_set_open(p_code text, p_open boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
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

  update skill_rooms
     set join_open      = coalesce(p_open, true),
         last_active_at = now(),
         expires_at     = now() + interval '30 days'
   where id = v_room.id;

  return jsonb_build_object('ok', true, 'join_open', coalesce(p_open, true));
end;
$$;

revoke all on function skill_room_set_open(text, boolean) from public;
grant execute on function skill_room_set_open(text, boolean) to authenticated;


-- 4) skill_room_extend — Neudeklaration aus 0081 §5, nur das Intervall geändert
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
  v_new := greatest(now(), v_room.expires_at) + interval '30 days';

  update skill_rooms set expires_at = v_new where id = v_room.id;

  return jsonb_build_object('ok', true, 'expires_at', v_new,
                            'revived', (v_room.expires_at <= now()));
end;
$$;

revoke all on function skill_room_extend(text) from public;
grant execute on function skill_room_extend(text) to authenticated;
