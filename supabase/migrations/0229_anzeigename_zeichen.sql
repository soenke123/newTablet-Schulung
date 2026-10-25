-- ══════════════════════════════════════════════════════════════
-- Migration 0229 — Anzeigename: dieselben Zeichen wie bei der Registrierung
-- ══════════════════════════════════════════════════════════════
-- Fund (Sicherheitsprüfung 24.10.2026): api/signup.js erlaubt im
-- Anzeigenamen nur Buchstaben (mit Umlauten), Ziffern, Leerzeichen und
-- . _ - (DISPLAY_NAME_RE). update_display_name (0004) prüfte beim
-- späteren Ändern aber nur Länge und Steuerzeichen — „<svg onload=…>“
-- passte in die 24 Zeichen. Alle Anzeigestellen maskieren heute (Bestenlisten,
-- Räume, Pinnwände, Admin-Panel …), aber der Name steht an so vielen
-- Stellen bei anderen, dass eine künftig vergessene Stelle sofort ein
-- Einfallstor wäre. Deshalb gilt die Regel jetzt auch hier.
--
-- Bestehende Namen bleiben, wie sie sind; geprüft wird beim Ändern.
-- Fehler: 'invalid_chars' (gab es schon für Steuerzeichen).
--
-- Die Funktion wird vollständig neu angelegt (Stand 0004 + Zeichenprüfung)
-- statt im laufenden Rumpf eine Zeile zu ersetzen: in der Live-Datenbank
-- wich der Rumpf vom Repo ab, die Ersetzung fand ihre Stelle nicht
-- (erster Versuch am 25.10.2026). Rückgabe und Fehlercodes sind dieselben.
--
-- Prüfstand: supabase/tests/0229_anzeigename_zeichen.mjs
-- ══════════════════════════════════════════════════════════════

create or replace function update_display_name(p_new_name text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id  uuid := auth.uid();
  v_locked   boolean;
  v_trimmed  text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_trimmed := btrim(p_new_name);

  if length(v_trimmed) < 2 or length(v_trimmed) > 24 then
    return jsonb_build_object('ok', false, 'error', 'invalid_length');
  end if;

  -- 0229: wie DISPLAY_NAME_RE in api/signup.js
  if v_trimmed ~ '[[:cntrl:]]' or v_trimmed !~ '^[A-Za-zÄÖÜäöüß0-9 ._-]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_chars');
  end if;

  if contains_blacklisted_word(v_trimmed) then
    return jsonb_build_object('ok', false, 'error', 'blacklisted');
  end if;

  select display_name_locked into v_locked
  from profiles where id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if v_locked then
    return jsonb_build_object('ok', false, 'error', 'name_locked');
  end if;

  update profiles set display_name = v_trimmed where id = v_user_id;

  return jsonb_build_object('ok', true, 'display_name', v_trimmed);
end;
$$;

revoke all on function update_display_name(text) from public, anon;
grant execute on function update_display_name(text) to authenticated;
