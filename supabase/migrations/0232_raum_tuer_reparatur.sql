-- ══════════════════════════════════════════════════════════════
-- Migration 0232 — „Tür öffnen“ / „Code wieder öffnen“ reparieren
-- ══════════════════════════════════════════════════════════════
-- Fehler live (25.10.2026): skill_room_set_open → 42601 „multiple
-- assignments to same column code_open_until“. Kein Raum ließ sich
-- mehr öffnen, kein Code wieder freigeben.
--
-- Ursache: Migration 0226 ergänzte den Rumpf per Ersetzung. Die erste
-- Fassung (vor d14c6e1) prüfte nicht, ob die Ersetzung schon drin war.
-- Zweimal ausgeführt, stand die Zeile `code_open_until = …` doppelt im
-- UPDATE.
--
-- Hier wird die Funktion vollständig neu angelegt (Stand 0205 + 0226),
-- unabhängig davon, wie oft 0226 lief. Rückgabe und Fehlercodes sind
-- dieselben. Mehrfach ausführbar.
--
-- Prüfstand: supabase/tests/0232_raum_tuer_reparatur.mjs
-- ══════════════════════════════════════════════════════════════

create or replace function skill_room_set_open(p_code text, p_open boolean)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or not skill_room_is_teacher(v_room.id, v_user) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- 0226: „Tür öffnen“ gibt dem Code wieder 90 Minuten.
  update skill_rooms
     set join_open       = coalesce(p_open, true),
         code_open_until = case when coalesce(p_open, true)
                                then now() + interval '90 minutes'
                                else code_open_until end,
         last_active_at  = now(),
         expires_at      = now() + interval '30 days'
   where id = v_room.id;

  return jsonb_build_object('ok', true, 'join_open', coalesce(p_open, true),
    'code_open_until', (select code_open_until from skill_rooms where id = v_room.id));
end;
$$;

grant execute on function skill_room_set_open(text, boolean) to authenticated;
