-- ══════════════════════════════════════════════════════════════
-- Migration 0086 — MPSkills: gruppierte Beiträge · Grenzen am Raum
--                  · „Wortwolke" heißt WordPool
-- ══════════════════════════════════════════════════════════════
-- Das Werkzeug bekommt bis zu sieben Fragen statt einer, und die
-- Lehrkraft stellt ein, wie viele Zettel jemand je Frage schreiben
-- darf. Beides ließe sich im Browser bauen — und beides wäre damit
-- eine Behauptung statt einer Regel. Also hier.
--
-- ── Zwei neue Begriffe, beide GENERISCH ────────────────────────
-- Die Inhaltsschicht aus 0080 deutet payload nicht; sie prüft ihn
-- gegen skill_tools.limits. Dabei bleibt es. Sie lernt hier zwei
-- Angaben dazu, die jedes Werkzeug für sich bestellen kann:
--
--   group_field    text   welcher payload-Schlüssel die GRUPPE eines
--                         Beitrags trägt (bei WordPool: 'q')
--   group_setting  text   welcher settings-Schlüssel die Liste der
--                         Gruppen trägt (bei WordPool: 'questions')
--   max_groups     int    wie viele es davon höchstens geben darf
--   room_limits    text[] welche Grenzen die LEHRKRAFT am Raum
--                         überschreiben darf (bei WordPool:
--                         max_entries)
--
-- Eine Gruppe ist ein Objekt in settings mit einer nicht-leeren
-- `id`; alles Weitere daran (bei WordPool ein `text`) geht die
-- generische Schicht nichts an. Daraus folgen drei Dinge, und alle
-- drei sind der Grund für diese Datei:
--
--   1) Das Kontingent zählt JE GRUPPE. „5 Zettel" heißt fünf bei
--      jeder Frage — sonst machte eine nachträglich ergänzte Frage
--      das Kontingent aller enger, und die Lehrkraft müsste beim
--      Ergänzen mitrechnen.
--   2) Ein Beitrag muss in eine Gruppe zeigen, die es gibt. Sonst
--      entstünden Zettel, die niemand mehr sieht — auch die
--      Lehrkraft nicht.
--   3) Eine Gruppe, unter der schon etwas liegt, ist EINGEFROREN:
--      Text ändern und löschen gehen nicht mehr. Leere Gruppen
--      bleiben änderbar, neue dürfen jederzeit dazu. Das ist die
--      Verfeinerung der Regel aus 0084 („settings nur, solange kein
--      Beitrag da ist"), und sie ist nötig, weil eine Frage jetzt
--      nicht mehr der ganze Raum ist, sondern ein Fach darin.
--
-- ── Warum die Grenze am Raum stehen darf ───────────────────────
-- 0080 sagt: was NICHT verhandelbar ist, steht nicht in der
-- Registry — 4 KB je payload, 8 KB je settings. Das gilt weiter.
-- max_entries ist aber keine Ressourcengrenze, sondern eine Regel
-- des Unterrichts: zehn Zettel sind in der einen Stunde großzügig
-- und in der nächsten zu wenig. Deshalb darf sie an den Raum — aber
-- nur die, und nur weil das Werkzeug sie ausdrücklich freigibt
-- (room_limits). Ein `update skill_rooms set settings` kann damit
-- weder die Textlänge noch die Phasen noch die Größengrenzen
-- anfassen.
--
-- ── Und der Name ───────────────────────────────────────────────
-- Aus „Wortwolke" wird „WordPool". Umbenannt wird nur, was man
-- SIEHT: skill_tools.title. Die id bleibt `wordcloud`, der Ordner
-- bleibt `wordcloud`, die CSS-Klassen bleiben `bd-`. Dieselbe
-- Trennung wie bei Reality Check (0065) und aus demselben Grund —
-- ein Rename in Spalten und Pfaden ist eine Migration ohne
-- Gegenwert. Wer im Code `wordcloud` liest, meint WordPool.
--
-- ⚠️ Vier Funktionen werden neu deklariert. Jede aus ihrer JEWEILS
-- AKTUELLEN Fassung übernommen — skill_entry_upsert aus 0081 (mit
-- Sperrprüfung und Schimpfwortfilter), skill_view und
-- skill_room_update aus 0084, skill_room_create aus 0079. Eine aus
-- 0080 kopierte skill_entry_upsert hätte den Wortfilter wieder
-- verloren.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Die Grenzen eines Raums — jetzt mit Überschreibung
-- ─────────────────────────────────────────────────────────────
-- Ein Ort, an dem gelesen wird, was gilt (0080). Neu ist nur, dass
-- die Antwort nicht mehr allein aus der Registry kommt.
--
-- Übernommen wird ein Wert nur, wenn er DREI Bedingungen erfüllt:
-- der Schlüssel steht in room_limits, der Wert ist eine Zahl, und
-- er liegt zwischen 0 und 1000. Die harte Obergrenze ist bewusst
-- keine Frage der Registry: settings schreibt die Lehrkraft, und
-- eine Zahl, die aus einem Formular kommt, darf nirgends
-- unbeschränkt in eine Zählschleife laufen.
--
-- 0 heißt „unbegrenzt" und muss deshalb GEWINNEN, wo die Registry
-- eine Zahl stehen hat: geprüft wird auf Anwesenheit des
-- Schlüssels, nicht auf Wahrheitswert.
create or replace function skill_limits(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_lim  jsonb;
  v_set  jsonb;
  v_keys jsonb;
  k      text;
  v      jsonb;
  n      int;
begin
  select coalesce(t.limits, '{}'::jsonb), coalesce(r.settings, '{}'::jsonb)
    into v_lim, v_set
    from skill_rooms r
    join skill_tools t on t.id = r.tool_id
   where r.id = p_room;

  if v_lim is null then
    return '{}'::jsonb;
  end if;

  v_keys := v_lim->'room_limits';
  if jsonb_typeof(v_keys) <> 'array' then
    return v_lim;
  end if;

  for k in select jsonb_array_elements_text(v_keys) loop
    v := v_set->k;
    if v is null or jsonb_typeof(v) <> 'number' then
      continue;
    end if;
    n := least(1000, greatest(0, floor((v#>>'{}')::numeric)::int));
    v_lim := jsonb_set(v_lim, array[k], to_jsonb(n));
  end loop;

  return v_lim;
end;
$$;

revoke all on function skill_limits(uuid) from public;

comment on function skill_limits(uuid) is
  'Die Grenzen, die in einem Raum gelten: skill_tools.limits, überschrieben von den '
  'Schlüsseln, die das Werkzeug in room_limits freigibt. Alles Übrige — Textlängen, '
  'Phasen, Größengrenzen — bleibt der Registry und ist am Raum nicht verhandelbar.';


-- ─────────────────────────────────────────────────────────────
-- 2) Gruppen lesen
-- ─────────────────────────────────────────────────────────────
-- Gibt NULL zurück, wenn das Werkzeug gar keine Gruppen kennt —
-- das ist etwas anderes als „kennt welche, hat aber keine", und der
-- Unterschied entscheidet, ob überhaupt geprüft wird.
create or replace function skill_group_ids(p_settings jsonb, p_lim jsonb)
  returns text[]
  immutable
  set search_path = public
  language sql
as $$
  select case
    when nullif(p_lim->>'group_setting', '') is null then null::text[]
    when jsonb_typeof(p_settings->(p_lim->>'group_setting')) <> 'array' then '{}'::text[]
    else (
      -- Spaltenalias ausgeschrieben (e(v)) und nicht als
      -- Ganzzeilen-Verweis: jsonb_array_elements nennt seine Spalte
      -- `value`, ein blankes `e` wäre also etwas anderes als das,
      -- wonach es aussieht.
      select coalesce(array_agg(e.v->>'id'), '{}'::text[])
        from jsonb_array_elements(p_settings->(p_lim->>'group_setting')) as e(v)
       where nullif(e.v->>'id', '') is not null
    )
  end;
$$;

revoke all on function skill_group_ids(jsonb, jsonb) from public;


-- In welcher Gruppe steht dieser Beitrag? NULL, wenn das Werkzeug
-- keine kennt oder der Beitrag nichts dazu sagt.
create or replace function skill_group_of(p_payload jsonb, p_lim jsonb)
  returns text
  immutable
  set search_path = public
  language sql
as $$
  select case
    when nullif(p_lim->>'group_field', '') is null then null
    else nullif(p_payload->>(p_lim->>'group_field'), '')
  end;
$$;

revoke all on function skill_group_of(jsonb, jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 3) Eine Gruppenliste auf Form prüfen
-- ─────────────────────────────────────────────────────────────
-- Gibt NULL zurück, wenn alles stimmt, sonst den Fehlerschlüssel —
-- dasselbe Muster wie skill_check_payload (0080).
--
-- Geprüft wird nur, was die generische Schicht auch benutzt: eine
-- nicht-leere Liste von Objekten mit eindeutiger, nicht-leerer id.
-- Was sonst noch an einem Eintrag hängt (bei WordPool der Text der
-- Frage), prüft das Werkzeug — hier wäre es geraten.
--
-- Eine LEERE Liste ist ein Fehler und kein Sonderfall: gäbe es
-- keine Gruppe, könnte kein Beitrag mehr in eine zeigen, und der
-- Raum wäre stumm, ohne dass irgendwo stünde warum.
create or replace function skill_check_settings(p_settings jsonb, p_lim jsonb)
  returns text
  stable
  set search_path = public
  language plpgsql
as $$
declare
  v_gset text := nullif(p_lim->>'group_setting', '');
  v_arr  jsonb;
  v_max  int;
  v_ids  text[];
begin
  if v_gset is null or p_settings is null then
    return null;
  end if;

  v_arr := p_settings->v_gset;
  -- Nicht mitgeschickt heißt unverändert, nicht leer.
  if v_arr is null then
    return null;
  end if;

  if jsonb_typeof(v_arr) <> 'array' then
    return 'groups_invalid';
  end if;
  if jsonb_array_length(v_arr) = 0 then
    return 'groups_required';
  end if;

  v_max := coalesce(nullif(p_lim->>'max_groups', '')::int, 20);
  if jsonb_array_length(v_arr) > v_max then
    return 'too_many_groups';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_arr) as e(v)
     where jsonb_typeof(e.v) <> 'object' or nullif(e.v->>'id', '') is null
  ) then
    return 'groups_invalid';
  end if;

  select array_agg(e.v->>'id') into v_ids from jsonb_array_elements(v_arr) as e(v);
  if array_length(v_ids, 1) <> (select count(distinct x) from unnest(v_ids) x) then
    return 'groups_invalid';
  end if;

  return null;
end;
$$;

revoke all on function skill_check_settings(jsonb, jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 4) skill_entry_upsert — Gruppe und Kontingent je Gruppe
-- ─────────────────────────────────────────────────────────────
-- Grundgerüst unverändert aus 0081 (Sperrprüfung, Phasensperre,
-- payload-Prüfung, Schimpfwortfilter). Drei Stellen sind neu:
--
--   · Beim ANLEGEN muss die Gruppe existieren. Ein Beitrag in eine
--     Frage, die es nicht gibt, wäre für alle unsichtbar — auch für
--     die Lehrkraft, die ihn ausblenden könnte.
--   · Beim ÄNDERN wird die Gruppe aus dem bestehenden Beitrag
--     übernommen und der mitgeschickte Wert verworfen. Bearbeiten
--     ändert den TEXT, nicht das Fach: sonst könnte man einen
--     Zettel in eine Frage schieben, deren Kontingent schon voll
--     ist, und hätte dort einen zu viel.
--   · Gezählt wird je Gruppe.
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
  v_gfld  text;
  v_grp   text;
  v_ids   text[];
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
  -- eine Zahl). Mit Wortgrenzen, siehe 0081 — contains_blacklisted_word
  -- wäre hier der falsche Aufruf.
  v_field := nullif(v_lim->>'text_field', '');
  if v_field is not null and contains_blacklisted_text(v_pl->>v_field) then
    return jsonb_build_object('ok', false, 'error', 'text_blocked');
  end if;

  if char_length(coalesce(p_kind, '')) not between 1 and 24 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_gfld := nullif(v_lim->>'group_field', '');

  -- Ändern: die Beitrags-ID gilt nur zusammen mit Raum UND
  -- Teilnehmer. Beides aus der Token-Auflösung, keines von außen.
  if p_id is not null then
    select * into v_entry from skill_room_entries
     where id = p_id and room_id = v_room.id and participant_id = v_p.id;
    if v_entry.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    -- Die Gruppe gehört dem Beitrag und nicht dem Formular, das ihn
    -- gerade ändert.
    if v_gfld is not null then
      v_pl := case
                when v_entry.payload ? v_gfld
                  then jsonb_set(v_pl, array[v_gfld], v_entry.payload->v_gfld)
                else v_pl - v_gfld
              end;
    end if;

    update skill_room_entries
       set payload = v_pl, updated_at = now()
     where id = v_entry.id;

    perform skill_touch(v_room.id);
    return jsonb_build_object('ok', true, 'updated', true, 'id', v_entry.id);
  end if;

  -- Anlegen: erst die Gruppe, dann das Kontingent darin.
  v_grp := skill_group_of(v_pl, v_lim);
  v_ids := skill_group_ids(v_room.settings, v_lim);
  if v_ids is not null and (v_grp is null or not (v_grp = any(v_ids))) then
    return jsonb_build_object('ok', false, 'error', 'group_unknown');
  end if;

  -- Gezählt werden auch ausgeblendete — sonst schafft Moderation
  -- neuen Platz, und wer ausgeblendet wird, bekäme einen Zettel
  -- geschenkt.
  v_max := coalesce(nullif(v_lim->>'max_entries', '')::int, 0);
  if v_max > 0 then
    select count(*) into v_used from skill_room_entries
     where room_id = v_room.id and participant_id = v_p.id
       and (v_gfld is null or payload->>v_gfld is not distinct from v_grp);
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


-- ─────────────────────────────────────────────────────────────
-- 5) skill_view — Verbrauch je Gruppe
-- ─────────────────────────────────────────────────────────────
-- Unverändert aus 0084 bis auf ein Feld: me.entries_by_group.
--
-- Der Client könnte das NICHT selbst zählen. Seine eigenen
-- ausgeblendeten Beiträge stehen in keiner Teilnehmer-Ansicht
-- (skill_entries_json, p_all = false) — er zählte sie also nicht
-- mit, während der Server sie mitzählt, und das Formular böte einen
-- Zettel an, den das Speichern abweist. Genau dafür gab es
-- entries_used schon in 0080; das bleibt als Gesamtzahl stehen.
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
  v_gfld  text;
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
  v_gfld  := nullif(v_lim->>'group_field', '');
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
            'name',  skill_seat_name(v_p.name, v_p.seat),
            'named', (v_p.name is not null),
            'entries_used', (select count(*) from skill_room_entries e
                              where e.room_id = v_room.id and e.participant_id = v_p.id),
            'entries_by_group', case when v_gfld is null then null else (
              select coalesce(jsonb_object_agg(t.g, t.c), '{}'::jsonb)
                from (
                  select e.payload->>v_gfld as g, count(*) as c
                    from skill_room_entries e
                   where e.room_id = v_room.id
                     and e.participant_id = v_p.id
                     and nullif(e.payload->>v_gfld, '') is not null
                   group by 1
                ) t) end,
            -- Vorgerechnet statt vom Client abgeleitet: ob geschrieben
            -- werden darf, entscheidet dieselbe Funktion, die es beim
            -- Speichern durchsetzt.
            'may_write', skill_may_write(v_lim, v_phase)
          )
  );
end;
$$;

revoke all on function skill_view(text) from public;
grant execute on function skill_view(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) skill_room_update — die Sperre wird gruppenfein
-- ─────────────────────────────────────────────────────────────
-- 0084 hat gesagt: settings nur ändern, solange KEIN Beitrag da ist.
-- Das war richtig, solange settings der ganze Auftrag war — eine
-- Frage, ausgetauscht bei 20 Zetteln, und die Zettel antworten auf
-- etwas anderes als das, was oben steht.
--
-- Mit mehreren Fragen ist settings kein Block mehr, sondern ein
-- Regal. Deshalb drei Regeln statt einer:
--
--   Gruppenliste     je Gruppe. Eine Gruppe mit Beiträgen ist
--                    eingefroren (Text ändern = löschen = nein),
--                    eine leere bleibt änderbar, neue dürfen
--                    jederzeit dazu. Die Begründung von 0084 gilt
--                    unverändert — nur eben je Frage.
--   room_limits      immer. Das Kontingent zu erhöhen, weil die
--                    Klasse mehr braucht, ist genau der Fall, für
--                    den es die Einstellung gibt; es mitten in der
--                    Stunde zu sperren, hieße die Stunde zu sperren.
--   alles Übrige     wie in 0084: nur solange kein Beitrag da ist.
--
-- Die Reihenfolge in der Liste ist ausdrücklich frei: sie ordnet
-- Fächer, sie benennt sie nicht.
--
-- Nebenbei mitgenommen: die Verlängerung steht jetzt auf 30 Tagen.
-- 0085 hat die Frist überall umgestellt, diese Funktion aber nicht
-- angefasst — sie schob den Ablauf beim Speichern der Einstellungen
-- weiter auf 60 als jeder andere Weg.
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
          if v_rec.newv is null or v_rec.newv <> v_rec.oldv then
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

comment on function skill_room_update(text, text, boolean, jsonb) is
  'Raum-Einstellungen ändern, nachdem er steht. null heißt unverändert. Titel immer; '
  'Namensabfrage nur vor dem ersten Beitritt; die Gruppenliste je Gruppe (eine mit '
  'Beiträgen ist eingefroren, neue dürfen jederzeit dazu); die in room_limits '
  'freigegebenen Grenzen immer; alles Übrige nur vor dem ersten Beitrag.';


-- ─────────────────────────────────────────────────────────────
-- 7) skill_room_create — dieselbe Formprüfung
-- ─────────────────────────────────────────────────────────────
-- Unverändert aus 0079 bis auf vier Zeilen: die Gruppenliste wird
-- schon beim Anlegen auf Form geprüft. Sonst entstünde ein Raum,
-- dessen Fragen keine ids haben — und in den anschließend kein
-- Beitrag mehr hineinpasst, weil skill_entry_upsert die Gruppe
-- nicht wiederfindet.
create or replace function skill_room_create(
  p_tool_id   text,
  p_title     text    default null,
  p_ask_names boolean default true,
  p_settings  jsonb   default '{}'::jsonb,
  p_is_test   boolean default false
)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_school uuid;
  v_tool   skill_tools;
  v_title  text;
  v_live   int;
  v_code   text;
  v_room   skill_rooms;
  v_err    text;
  i        int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;

  select school_id into v_school from profiles where id = v_user;
  if v_school is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  select * into v_tool from skill_tools where id = p_tool_id;
  if v_tool.id is null then
    return jsonb_build_object('ok', false, 'error', 'tool_unknown');
  end if;
  -- Abgeschaltetes Tool: bestehende Räume laufen weiter, neue gibt
  -- es nicht (Entscheidung 17.08.2026). Gilt auch für den Testraum
  -- — sonst wäre „abgeschaltet" für Admins nur eine Anzeige.
  if not v_tool.active then
    return jsonb_build_object('ok', false, 'error', 'tool_inactive');
  end if;

  -- Die Gruppenliste muss stimmen, bevor der Raum entsteht.
  v_err := skill_check_settings(p_settings, coalesce(v_tool.limits, '{}'::jsonb));
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  -- Ein bestehender Testraum wird wiederverwendet statt vermehrt.
  if p_is_test then
    select * into v_room
      from skill_rooms
     where owner_id = v_user and tool_id = p_tool_id and is_test = true;
    if v_room.id is not null then
      -- Ein Testraum, den man wieder aufmacht, ist Aktivität: er
      -- soll nicht ablaufen, während er in Gebrauch ist.
      perform skill_touch(v_room.id);
      return jsonb_build_object(
        'ok', true, 'reused', true, 'code', v_room.code,
        'room', skill_room_json(v_room.id)
      );
    end if;
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null then
    v_title := case when p_is_test then v_tool.title || ' (Test)' else v_tool.title end;
  end if;
  if char_length(v_title) > 60 then
    return jsonb_build_object('ok', false, 'error', 'title_too_long');
  end if;

  -- Obergrenze — Testräume und abgelaufene Räume zählen nicht mit.
  if not p_is_test then
    select count(*) into v_live
      from skill_rooms
     where owner_id = v_user and tool_id = p_tool_id
       and is_test = false and expires_at > now();

    -- multi_room = false heißt: genau einer, egal was max_rooms sagt.
    if not v_tool.multi_room and v_live >= 1 then
      return jsonb_build_object('ok', false, 'error', 'single_room_only', 'live', v_live);
    end if;
    if v_live >= v_tool.max_rooms then
      return jsonb_build_object('ok', false, 'error', 'room_limit',
                                'live', v_live, 'max', v_tool.max_rooms);
    end if;
  end if;

  -- Code suchen. Bei gut einer Milliarde Möglichkeiten ist schon
  -- der erste Versuch praktisch immer frei; die Schleife ist für
  -- den Fall, dass er es einmal nicht ist.
  for i in 1..12 loop
    v_code := skill_gen_code();
    begin
      insert into skill_rooms (code, tool_id, owner_id, school_id, title,
                               ask_names, is_test, settings)
      values (v_code, p_tool_id, v_user, v_school, v_title,
              coalesce(p_ask_names, true), coalesce(p_is_test, false),
              coalesce(p_settings, '{}'::jsonb))
      returning * into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
    end;
  end loop;

  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'code_collision');
  end if;

  return jsonb_build_object(
    'ok', true, 'reused', false, 'code', v_room.code,
    'room', skill_room_json(v_room.id)
  );
end;
$$;

revoke all on function skill_room_create(text, text, boolean, jsonb, boolean) from public;
grant execute on function skill_room_create(text, text, boolean, jsonb, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) WordPool in der Registry
-- ─────────────────────────────────────────────────────────────
-- max_entries steht auf 0 = UNBEGRENZT. Das ist die neue Vorgabe:
-- eine Zahl, die niemand eingestellt hat, soll niemanden bremsen.
-- Wer eine will, trägt sie in den Einstellungen des Raums ein
-- (room_limits), und dann gilt sie je Frage.
--
-- max_groups 7: sieben Fragen sind eine Doppelstunde. Die Zahl steht
-- in der Registry und nicht im Browser, damit eine Ausnahme später
-- ein `update` ist und keine Auslieferung.
update skill_tools set
  title = 'WordPool',
  blurb = 'Bis zu sieben Fragen, viele kurze Antworten — was die Klasse am meisten '
       || 'trägt, steht am größten in der Mitte.',
  limits = jsonb_build_object(
    'max_entries',   0,
    'text_field',    'text',
    'min_len',       3,
    'max_len',       60,
    'phases',        2,
    'write_phases',  jsonb_build_array(1),
    'votes',         true,
    'self_vote',     false,
    'group_field',   'q',
    'group_setting', 'questions',
    'max_groups',    7,
    'room_limits',   jsonb_build_array('max_entries')
  )
 where id = 'wordcloud';


-- ─────────────────────────────────────────────────────────────
-- 9) Bestehende Räume nachziehen
-- ─────────────────────────────────────────────────────────────
-- Aus der einen Frage (settings.question) wird eine Liste mit genau
-- einem Eintrag, und die vorhandenen Zettel zeigen darauf. Ohne das
-- stünde in einem laufenden Raum eine Wolke ohne Fach: die Zettel
-- wären da, aber keine Frage würde sie zeigen.
update skill_rooms
   set settings = (settings - 'question')
     || jsonb_build_object('questions', jsonb_build_array(
          jsonb_build_object('id', 'q1', 'text', settings->>'question')))
 where tool_id = 'wordcloud'
   and settings ? 'question'
   and not (settings ? 'questions');

-- Räume ganz ohne Frage (angelegt, bevor das Feld Pflicht war) —
-- sie bekommen eine, sonst nimmt der Plus-Knopf keine Zettel an.
update skill_rooms
   set settings = settings || jsonb_build_object('questions', jsonb_build_array(
          jsonb_build_object('id', 'q1', 'text', 'Was fällt euch dazu ein?')))
 where tool_id = 'wordcloud'
   and not (settings ? 'questions');

-- Und die Zettel in dieses eine Fach. `payload ? 'q'` und nicht
-- `payload->>'q' is null`: ein Zettel, der schon eine Gruppe trägt,
-- wird nicht angefasst.
update skill_room_entries e
   set payload = jsonb_set(e.payload, '{q}', '"q1"'::jsonb)
  from skill_rooms r
 where r.id = e.room_id
   and r.tool_id = 'wordcloud'
   and not (e.payload ? 'q');
