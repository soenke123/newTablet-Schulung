-- 0193 · Fragen mit Beiträgen dürfen umformuliert werden
--
-- Bisher (0086) war eine Gruppe mit Beiträgen komplett eingefroren:
-- weder löschen noch den Text ändern. Das Umformulieren (Tippfehler,
-- bessere Formulierung) ist aber harmlos — die id bleibt, an ihr hängen
-- die Beiträge. Gesperrt bleibt nur noch das ENTFERNEN. Die Reihenfolge
-- der Liste war nie gesperrt (Vergleich je id), ist jetzt aber ein
-- gewollter Fall: die Lehrkraft sortiert per Drag-and-drop.

create or replace function skill_room_update(
  p_code      text,
  p_title     text    default null,
  p_ask_names boolean default null,
  p_settings  jsonb   default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_room   skill_rooms;
  v_title  text;
  v_people int;
  v_ent    int;
  v_lim    jsonb;
  v_gset   text;
  v_gfld   text;
  v_err    text;
  v_rest_o jsonb;
  v_rest_n jsonb;
  v_key    text;
  v_rec    record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Titel
  if p_title is not null then
    v_title := nullif(btrim(p_title), '');
    if v_title is null then
      return jsonb_build_object('ok', false, 'error', 'title_required');
    end if;
    if char_length(v_title) > 60 then
      return jsonb_build_object('ok', false, 'error', 'title_too_long');
    end if;
  end if;

  -- Namensabfrage — unverändert aus 0084.
  if p_ask_names is not null and p_ask_names <> v_room.ask_names then
    select count(*) into v_people
      from skill_participants where room_id = v_room.id;
    if v_people > 0 then
      return jsonb_build_object('ok', false, 'error', 'has_participants',
                                'people', v_people);
    end if;
  end if;

  -- Werkzeug-Einstellungen
  if p_settings is not null then
    if jsonb_typeof(p_settings) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    -- Die Tabelle hat dafür einen Constraint (0080). Hier abgefangen,
    -- damit der Client eine Antwort bekommt und keinen SQL-Fehler.
    if octet_length(p_settings::text) > 8192 then
      return jsonb_build_object('ok', false, 'error', 'payload_too_big');
    end if;

    v_lim  := skill_limits(v_room.id);
    v_gset := nullif(v_lim->>'group_setting', '');
    v_gfld := nullif(v_lim->>'group_field', '');

    v_err := skill_check_settings(p_settings, v_lim);
    if v_err is not null then
      return jsonb_build_object('ok', false, 'error', v_err);
    end if;

    if p_settings <> v_room.settings then
      /* Alles, was WEDER Gruppenliste NOCH freigegebene Grenze ist,
         fällt unter die Regel aus 0084. Verglichen wird der Rest
         gegen den Rest — sonst löste schon das Ergänzen einer Frage
         die alte, harte Sperre aus. */
      v_rest_o := v_room.settings;
      v_rest_n := p_settings;
      if v_gset is not null then
        v_rest_o := v_rest_o - v_gset;
        v_rest_n := v_rest_n - v_gset;
      end if;
      if jsonb_typeof(v_lim->'room_limits') = 'array' then
        for v_key in select jsonb_array_elements_text(v_lim->'room_limits') loop
          v_rest_o := v_rest_o - v_key;
          v_rest_n := v_rest_n - v_key;
        end loop;
      end if;

      if v_rest_n <> v_rest_o then
        select count(*) into v_ent
          from skill_room_entries where room_id = v_room.id;
        if v_ent > 0 then
          return jsonb_build_object('ok', false, 'error', 'has_entries', 'entries', v_ent);
        end if;
      end if;

      /* Und nun je Gruppe: geprüft wird gegen den ALTEN Bestand.
         Was dort steht und im neuen fehlt, ist gelöscht; was dort
         steht und sich unterscheidet, ist geändert. Beides ist für
         eine Gruppe mit Beiträgen zu spät. */
      if v_gset is not null and v_gfld is not null then
        /* jsonb_typeof statt coalesce: ein JSON-`null` ist nicht SQL-NULL
           und käme durch coalesce durch — jsonb_array_elements bräche
           dann mit einem SQL-Fehler ab statt mit einer Antwort. */
        for v_rec in
          select o.v->>'id' as gid, o.v as oldv,
                 (select n.v from jsonb_array_elements(
                            case when jsonb_typeof(p_settings->v_gset) = 'array'
                                 then p_settings->v_gset else '[]'::jsonb end) as n(v)
                   where n.v->>'id' = o.v->>'id' limit 1) as newv
            from jsonb_array_elements(
                   case when jsonb_typeof(v_room.settings->v_gset) = 'array'
                        then v_room.settings->v_gset else '[]'::jsonb end) as o(v)
           where nullif(o.v->>'id', '') is not null
        loop
          if v_rec.newv is null then
            select count(*) into v_ent from skill_room_entries e
             where e.room_id = v_room.id and e.payload->>v_gfld = v_rec.gid;
            if v_ent > 0 then
              return jsonb_build_object('ok', false, 'error', 'group_has_entries',
                                        'group', v_rec.gid, 'entries', v_ent);
            end if;
          end if;
        end loop;
      end if;
    end if;
  end if;

  update skill_rooms
     set title          = coalesce(v_title, title),
         ask_names      = coalesce(p_ask_names, ask_names),
         settings       = coalesce(p_settings, settings),
         last_active_at = now(),
         expires_at     = now() + interval '30 days'
   where id = v_room.id;

  return jsonb_build_object('ok', true, 'room', skill_room_json(v_room.id));
end;
$$;

revoke all on function skill_room_update(text, text, boolean, jsonb) from public;
grant execute on function skill_room_update(text, text, boolean, jsonb) to authenticated;

