-- ══════════════════════════════════════════════════════════════
-- Migration 0235 — Projektarbeit: Tätigkeitsbuch der Lehrkräfte
-- ══════════════════════════════════════════════════════════════
-- Sönke (26.10.2026): Die Gruppen-Übersicht heißt jetzt „Klassen-
-- übersicht" (nur Lehrkräfte). Rechts daneben steht ein TÄTIGKEITSBUCH:
-- Die Lehrkräfte eines Raums (Besitzer und Eingeladene, 0205) halten
-- fest, was in einer Stunde los war, damit die nächste Lehrkraft
-- ansetzen kann. Schüler sehen es nie.
--
--   pa_tlog   ein Eintrag = ein Tag (Kachel). Das Datum steht beim
--             Anlegen auf heute und lässt sich ändern. Die Texte liegen
--             je FELD in texts:
--               { "general":     { "t": "…", "by": "Frau A", "at": "…" },
--                 "<gruppe-id>": { "t": "…", "by": "Herr B", "at": "…",
--                                  "l": "Wetterstation (Mia, Leon)" } }
--             „general" = Bereich „Allgemeines", sonst die id einer
--             Gruppe. l = wie die Gruppe beim Schreiben hieß — wird die
--             Gruppe aufgelöst, steht der Text trotzdem noch lesbar da.
--             Gespeichert wird immer nur EIN Feld (pa_room_tlog_set):
--             Schreiben zwei Lehrkräfte gleichzeitig an verschiedenen
--             Gruppen, geht nichts verloren.
--
--   Deckel: 400 Einträge je Raum, 4000 Zeichen je Feld, 80 Felder je
--   Eintrag. Geht mit dem Raum (FK CASCADE, Raum hält 1 Jahr, 0202).
--   Nicht in Export/Backups.
--
-- Nur RPCs (security definer), keine Grants auf die Tabelle (CLAUDE.md,
-- NEUE TABELLE). Kein DROP, idempotent.
-- ══════════════════════════════════════════════════════════════


create table if not exists pa_tlog (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references skill_rooms(id) on delete cascade,
  day          date not null default current_date,
  texts        jsonb not null default '{}'::jsonb,
  author_id    uuid references profiles(id) on delete set null,
  author_name  text not null default 'Lehrkraft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table pa_tlog is
  'Projektarbeit (0235): Tätigkeitsbuch der Lehrkräfte eines Raums — je Tag eine Kachel, Texte je Feld (general / Gruppe). Nur über pa_room_tlog_*.';

create index if not exists pa_tlog_room_idx on pa_tlog (room_id, day desc, created_at desc);

alter table pa_tlog enable row level security;


-- Ein Eintrag als JSON für die Oberfläche.
create or replace function pa_tlog_json(p pa_tlog)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('id', p.id, 'day', p.day, 'texts', p.texts,
                            'by', p.author_name, 'at', p.created_at, 'upd', p.updated_at);
$$;

revoke all on function pa_tlog_json(pa_tlog) from public, anon, authenticated;


-- Alle Einträge des Raums, neuester Tag oben.
create or replace function pa_room_tlog_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'entries', coalesce((
    select jsonb_agg(pa_tlog_json(t) order by t.day desc, t.created_at desc)
      from pa_tlog t where t.room_id = v_room.id), '[]'::jsonb));
end;
$$;

revoke all on function pa_room_tlog_get(text) from public;
grant execute on function pa_room_tlog_get(text) to authenticated;


-- Neue Kachel (Datum: heute, wenn nichts kommt).
create or replace function pa_room_tlog_add(p_code text, p_day date default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_row  pa_tlog;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if (select count(*) from pa_tlog where room_id = v_room.id) >= 400 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
  end if;
  insert into pa_tlog (room_id, day, author_id, author_name)
  values (v_room.id, coalesce(p_day, current_date), auth.uid(), pa_teacher_name())
  returning * into v_row;
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'entry', pa_tlog_json(v_row));
end;
$$;

revoke all on function pa_room_tlog_add(text, date) from public;
grant execute on function pa_room_tlog_add(text, date) to authenticated;


-- Ein Feld (oder das Datum) eines Eintrags ändern.
--   p_key  'general' oder die id einer Gruppe dieses Raums; null = nur Datum
--   p_text leer = Feld entfernen
--   p_label wie die Gruppe gerade heißt (nur für Gruppen)
create or replace function pa_room_tlog_set(p_code text, p_entry uuid, p_day date default null,
                                            p_key text default null, p_text text default null,
                                            p_label text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_row  pa_tlog;
  v_txt  text := btrim(coalesce(p_text, ''));
  v_lbl  text := left(btrim(coalesce(p_label, '')), 200);
  v_val  jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  select * into v_row from pa_tlog where id = p_entry and room_id = v_room.id for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_day is not null then
    v_row.day := p_day;
  end if;

  if p_key is not null then
    if p_key <> 'general' and not exists (
         select 1 from pa_groups where room_id = v_room.id and id::text = p_key) then
      -- Aufgelöste Gruppe: vorhandenen Text darf man noch ändern/leeren.
      if not (v_row.texts ? p_key) then
        return jsonb_build_object('ok', false, 'error', 'not_found');
      end if;
    end if;
    if char_length(v_txt) > 4000 then
      return jsonb_build_object('ok', false, 'error', 'too_long');
    end if;
    if v_txt = '' then
      v_row.texts := v_row.texts - p_key;
    else
      if not (v_row.texts ? p_key) and (select count(*) from jsonb_object_keys(v_row.texts)) >= 80 then
        return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
      end if;
      v_val := jsonb_build_object('t', v_txt, 'by', pa_teacher_name(), 'at', now());
      if p_key <> 'general' then
        v_val := v_val || jsonb_build_object('l',
                   coalesce(nullif(v_lbl, ''), v_row.texts -> p_key ->> 'l', 'Gruppe'));
      end if;
      v_row.texts := v_row.texts || jsonb_build_object(p_key, v_val);
    end if;
  end if;

  update pa_tlog set day = v_row.day, texts = v_row.texts, updated_at = now()
   where id = v_row.id
  returning * into v_row;
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'entry', pa_tlog_json(v_row));
end;
$$;

revoke all on function pa_room_tlog_set(text, uuid, date, text, text, text) from public;
grant execute on function pa_room_tlog_set(text, uuid, date, text, text, text) to authenticated;


create or replace function pa_room_tlog_delete(p_code text, p_entry uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  delete from pa_tlog where id = p_entry and room_id = v_room.id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function pa_room_tlog_delete(text, uuid) from public;
grant execute on function pa_room_tlog_delete(text, uuid) to authenticated;
