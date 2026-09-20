-- ══════════════════════════════════════════════════════════════
-- Migration 0159 — Das Lehrwerk gehört der Schule
-- ══════════════════════════════════════════════════════════════
-- Anlass: das eingeführte Englischbuch zieht ein. Ein Jahrgang sind
-- rund 900 Wortpaare in 33 Stationen — und die tippt niemand ein
-- zweites Mal, nur weil die Kollegin nebenan dieselbe Klassenstufe
-- unterrichtet.
--
-- 0130 kennt zwei Sichtbarkeiten, und keine passt:
--
--   owner_id null  = mitgeliefert, jede Lehrkraft JEDER Schule
--                    sieht es. Das ist der Inhalt, den dieses Repo
--                    selbst zusammengestellt hat.
--   owner_id set   = privat. Die eigene Liste für Dienstag.
--
-- Ein Lehrwerk ist weder das eine noch das andere: es gehört EINER
-- Schule, weil genau sie es eingeführt hat. Also kommt eine dritte
-- Stufe dazu — dieselbe Zeile, ein Häkchen mehr.
--
-- ── Warum ein Merker und keine dritte Eigentumsform ───────────
-- Naheliegend wäre „gehört der Schule": owner_id null, school_id
-- gesetzt. Das verbietet der Riegel aus 0130 (`vocab_sets_owned`),
-- und ihn zu lockern hieße, ihn fallen zu lassen und neu zu setzen —
-- ein DROP mit Supabase-Warnung für eine Zeile Semantik
-- (Regel: feedback_supabase_no_drop_statements).
--
-- Der Merker kommt ohne das aus: Besitzer bleibt, wer es eingespielt
-- hat, und `shared` sagt „die Schule darf mitlesen".
--
-- ⚠️ Preis dieser Entscheidung, damit er nicht überrascht: hängt das
-- Konto der Lehrkraft, verschwindet mit ihr das Lehrwerk der Schule
-- (`on delete cascade` aus 0130). Bis dahin liegt das Buch also
-- bewusst auf einem BLEIBENDEN Konto. Wenn die Schule wächst, ist
-- die saubere Form „owner_id null + school_id" — dann aber als
-- eigene Migration mit Umhängen des Bestands, nicht nebenbei.
--
-- ── Was hier steht ────────────────────────────────────────────
--   1  shared             Zwei Spalten
--   2  vocab_visible      Die EINE Definition von „darf ich das sehen"
--   3  vocab_norm         Auslassungspunkte und Klammerzusätze
--   4  vocab_sets_list    Rumpf aus 0150, sieht jetzt Geteiltes
--   5  vocab_set_words    Rumpf aus 0154, dasselbe
--   6  wi_room_setup      Rumpf aus 0157, dasselbe
--   7  vocab_set_import   Rumpf aus 0150, Kontingent zählt anders
--   8  vocab_set_delete   Rumpf aus 0150, Geteiltes bleibt stehen
--
-- ── Was hier NICHT steht ──────────────────────────────────────
--   · Kein einziges Wort aus dem Buch. Der Inhalt kommt über ein
--     erzeugtes Skript direkt in die Datenbank und nicht durch
--     dieses öffentliche Repo — die Überlegung von 0130 („eine
--     Wortliste ist als Sammlung geschützt") gilt unverändert.
--     Die Regel, wie aus dem Verlags-PDF Zeilen werden, steht in
--     MPSkills/tools/wordisland/tools/greenline.mjs.
--   · Keine Insel je Jahrgang. Klasse 5 und die Test-Units teilen
--     sich `en:5` und damit weiterhin EINE Insel (Sönke, 20.09.2026:
--     „erstmal ein Jahrgang und bei einer Insel bleiben").
--
-- Kein DROP — Idempotenz per `add column if not exists` und
-- `create or replace`.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) shared — zwei Spalten
-- ─────────────────────────────────────────────────────────────
-- An der Unit UND an der Station, obwohl die Sichtbarkeit nur an der
-- Station hängt. Grund ist das Aufräumen: `vocab_set_delete` löscht
-- das leere Dach mit, und ein Dach ohne Merker wüsste nicht, dass es
-- der Schule gehört.
alter table vocab_units add column if not exists
  shared boolean not null default false;
alter table vocab_sets  add column if not exists
  shared boolean not null default false;

comment on column vocab_sets.shared is
  'Die ganze Schule darf diesen Satz sehen und verwenden. Besitzer bleibt, '
  'wer ihn eingespielt hat; löschen kann ihn niemand über die Oberfläche.';
comment on column vocab_units.shared is
  'Wie vocab_sets.shared — das Dach eines geteilten Lehrwerks.';

create index if not exists vocab_sets_shared_idx
  on vocab_sets(school_id) where shared;


-- ─────────────────────────────────────────────────────────────
-- 2) vocab_visible — „darf ich das sehen"
-- ─────────────────────────────────────────────────────────────
-- Vier Funktionen stellen dieselbe Frage. Bis 0157 stand sie
-- viermal als `owner_id is null or owner_id = auth.uid()` im Text,
-- und die vierte Fassung hätte die dritte Stufe garantiert
-- irgendwann nicht gehabt.
--
-- security definer, weil die Frage nach der eigenen Schule in
-- `profiles` nachsieht und die Aufrufer das ohnehin dürfen.
create or replace function vocab_visible(
  p_owner  uuid,
  p_school uuid,
  p_shared boolean
)
  returns boolean
  stable
  security definer
  set search_path = public
  language sql
as $$
  select p_owner is null                                   -- mitgeliefert
      or p_owner = auth.uid()                              -- meine Liste
      or (coalesce(p_shared, false)                        -- Schulbestand
          and p_school = (select school_id from profiles where id = auth.uid()));
$$;

revoke all on function vocab_visible(uuid, uuid, boolean) from public;
grant execute on function vocab_visible(uuid, uuid, boolean) to authenticated;

comment on function vocab_visible(uuid, uuid, boolean) is
  'Die drei Sichtbarkeiten an einer Stelle: mitgeliefert, eigen, von der '
  'eigenen Schule geteilt.';


-- ─────────────────────────────────────────────────────────────
-- 3) vocab_norm — zwei Kleinigkeiten aus dem Lehrwerk
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0130, zwei Änderungen. Beide kommen aus der Notation des
-- Buchs und gelten ab jetzt für jeden Satz:
--
--   „Ich bin aus …"    Die Auslassungspunkte gehören zur ANZEIGE:
--                      im Heft steht dort die Lücke, und deshalb
--                      bleiben sie stehen. Getippt werden sie mal
--                      und mal nicht — Sönke, 20.09.2026: „schüler
--                      können es ohne und mit punkten eingeben …
--                      beides richtig." Also fallen sie hier weg,
--                      wie jedes andere Satzzeichen auch.
--
--   „skates (pl)"      Der Klammerzusatz ist eine AUSKUNFT über das
--   „to go (to)"       Wort und nicht Teil davon. Bisher blieb sein
--                      Inhalt stehen („skates pl"), und wer schlicht
--                      „skates" schrieb, bekam „fast richtig". Jetzt
--                      fliegt der ganze Klammerausdruck heraus.
--
-- Angewachsene Klammern („gym(nasium)") verlieren damit ihre zweite
-- Lesart — die steht deshalb als eigene Fassung in `alt` und wird
-- vom Umwandler dort hineingeschrieben.
--
-- Die Reihenfolge ist Absicht: erst die Klammern weg, dann der
-- Artikel. Sonst stünde „(der) Hund" mit einer Klammer da, wo der
-- Artikel-Ausdruck einen Wortanfang erwartet.
--
-- Kein Index hängt an dieser Funktion (geprüft), ein Neuaufbau ist
-- also nicht nötig.
create or replace function vocab_norm(p_s text)
  returns text
  immutable
  set search_path = public
  language sql
as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 btrim(replace(lower(coalesce(p_s, '')), 'ß', 'ss')),
                 '\([^)]*\)', ' ', 'g'),
               '^(to|the|a|an|der|die|das|den|dem|ein|eine|einen)\s+', ''),
             '[.,;:!?"()„“”…]', '', 'g'),
           '\s+', ' ', 'g'));
$$;

comment on function vocab_norm(text) is
  'Vergleichsform einer Antwort. Artikel, „to", Satzzeichen, Auslassungspunkte '
  'und Klammerzusätze fallen weg, ß wird ss, Umlaute bleiben.';


-- ─────────────────────────────────────────────────────────────
-- 4) vocab_sets_list — das Pult sieht den Schulbestand
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0150 (höchste bestehende Fassung; Regel:
-- feedback_shop_state_merge_regressions). Zwei Stellen sind anders:
--
--   1) Die `where`-Zeile fragt vocab_visible.
--   2) `mine` heißt jetzt „steht im Reiter Eigene und trägt ein
--      Löschzeichen". Ein geteilter Satz ist für seinen Besitzer
--      ausdrücklich NICHT „mine": er gehört zum Bestand der Schule,
--      und ein Kreuz daneben wäre eine Einladung, ihn für alle
--      wegzuräumen. Das Gerät braucht dafür keine Zeile Änderung —
--      es kennt nur '0' und '1' (tool.js: `s.mine === '1'`).
create or replace function vocab_sets_list()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;

  return jsonb_build_object('ok', true, 'sets', coalesce((
    select jsonb_agg(x order by o_mine, o_grade, o_unit, o_utitle, o_station, o_title)
      from (
        select jsonb_build_object(
                 'id',     s.id,
                 'title',  s.title,
                 'theme',  s.theme,
                 'level',  s.level,
                 'from',   s.lang_from,
                 'to',     s.lang_to,
                 'mine',   case when s.owner_id = v_user and not s.shared
                                then '1' else '0' end,
                 'count',  (select count(*) from vocab_items i where i.set_id = s.id),
                 'unit',    u.id,
                 'utitle',  u.title,
                 'grade',   u.grade,
                 'island',  u.island_key,
                 'station', s.sort_order
               ) as x,
               case when s.owner_id = v_user and not s.shared then 1 else 0 end as o_mine,
               coalesce(u.grade, 99)       as o_grade,
               coalesce(u.sort_order, 0)   as o_unit,
               coalesce(u.title, s.title)  as o_utitle,
               s.sort_order                as o_station,
               s.title                     as o_title
          from vocab_sets s
          left join vocab_units u on u.id = s.unit_id
         where vocab_visible(s.owner_id, s.school_id, s.shared)
      ) t
  ), '[]'::jsonb));
end;
$$;

revoke all on function vocab_sets_list() from public;
grant execute on function vocab_sets_list() to authenticated;

comment on function vocab_sets_list() is
  'Alle sichtbaren Sätze, flach, mit ihrer Unit. Sichtbar ist mitgeliefert, '
  'eigen oder von der eigenen Schule geteilt.';

-- wi_sets_list(p_code) (0131) ruft diese Funktion auf und hängt nur
-- `chosen` an. Sie erbt die dritte Sichtbarkeit damit ohne eine
-- Zeile Änderung und wird hier NICHT angefasst.


-- ─────────────────────────────────────────────────────────────
-- 5) vocab_set_words — derselbe Blick in die Wörter
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0154. Ohne diese Fassung stünde die Station zwar in der
-- Liste, aber das Listen-Zeichen ☰ daneben meldete „nicht gefunden" —
-- und das sähe nach einem Fehler aus, wo es eine Rechteentscheidung
-- wäre.
create or replace function vocab_set_words(p_set uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_set  jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;

  select jsonb_build_object(
           'id',     s.id,
           'title',  s.title,
           'theme',  s.theme,
           'level',  s.level,
           'from',   s.lang_from,
           'to',     s.lang_to,
           'mine',   case when s.owner_id = v_user and not s.shared
                          then '1' else '0' end,
           'unit',   u.id,
           'utitle', u.title,
           'grade',  u.grade)
    into v_set
    from vocab_sets s
    left join vocab_units u on u.id = s.unit_id
   where s.id = p_set
     and vocab_visible(s.owner_id, s.school_id, s.shared);

  if v_set is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'set', v_set, 'words', coalesce((
    select jsonb_agg(jsonb_build_object(
             't',  i.term,
             'x',  i.translation,
             'a',  to_jsonb(i.alt),
             'at', to_jsonb(i.alt_term))
           order by i.sort_order, i.term)
      from vocab_items i
     where i.set_id = p_set), '[]'::jsonb));
end;
$$;

revoke all on function vocab_set_words(uuid) from public;
grant execute on function vocab_set_words(uuid) to authenticated;

comment on function vocab_set_words(uuid) is
  'Alle Wortpaare einer Station, in Buchreihenfolge, mit ihren Nebenformen. '
  'Ohne jeden Lernstand — die Frage ist „welche Wörter stehen hier".';


-- ─────────────────────────────────────────────────────────────
-- 6) wi_room_setup — geteilte Stationen dürfen in den Raum
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0157 (dort kam sets_changed_at dazu; die ältere Fassung
-- zu nehmen nähme es wieder weg). Geändert ist EINE Zeile: die
-- Prüfung beim Einfügen in wi_room_sets.
--
-- Sie ist der eigentliche Zweck der ganzen Migration. Ohne sie sieht
-- die Kollegin das Lehrwerk in der Auswahl, tippt eine Station an —
-- und im Raum liegt danach nichts, weil der Server ihre Wahl
-- stillschweigend verworfen hat.
create or replace function wi_room_setup(
  p_code       text,
  p_sets       uuid[] default null,
  p_teams      int    default null,
  p_duration   int    default null,
  p_direction  text   default null,
  p_mode       text   default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
  v_b    wi_boards;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_b from wi_boards where room_id = v_room;
  -- Team-Zahl und Insel stehen nach dem Start fest. Units, Richtung
  -- und Modus dürfen weiter wechseln: „jetzt bitte andersherum"
  -- mitten in der Runde ist ein legitimer Zug der Lehrkraft.
  if v_b.phase <> 'lobby' and p_teams is not null and p_teams <> v_b.team_count then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  update wi_boards
     set team_count      = coalesce(p_teams, team_count),
         duration_secs   = coalesce(p_duration, duration_secs),
         direction        = coalesce(p_direction, direction),
         mode             = coalesce(p_mode, mode),
         sets_changed_at  = case when p_sets is not null then now()
                                 else sets_changed_at end
   where room_id = v_room;

  if p_sets is not null then
    delete from wi_room_sets where room_id = v_room and not (set_id = any(p_sets));
    insert into wi_room_sets (room_id, set_id)
    select v_room, s.id from vocab_sets s
     where s.id = any(p_sets)
       and vocab_visible(s.owner_id, s.school_id, s.shared)
    on conflict do nothing;

    -- Die laufende Aufgabe kann aus einer eben abgewählten Unit
    -- stammen. Sie wird zurückgesetzt, sonst fragt das Tablet noch
    -- ein Wort ab, das gar nicht mehr dran ist.
    update wi_players set current_item = null where room_id = v_room;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function wi_room_setup(text, uuid[], int, int, text, text) from public;
grant execute on function wi_room_setup(text, uuid[], int, int, text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) vocab_set_import — das Lehrwerk zählt nicht gegen das Konto
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0150. Geändert ist die Zeile mit dem Kontingent.
--
-- Vierzig eigene Listen waren als Grenze gegen Wildwuchs gedacht.
-- Ein Jahrgang des Buchs sind 33 Stationen auf EINEM Konto — die
-- Lehrkraft, die es einspielt, hätte danach noch sieben eigene
-- Listen frei, und die Kollegin nebenan alle vierzig. Das ist keine
-- Grenze mehr, sondern eine Strafe fürs Einspielen.
--
-- Gezählt wird deshalb, was wirklich jemandem allein gehört.
create or replace function vocab_set_import(
  p_title     text,
  p_text      text,
  p_theme     text default null,
  p_level     text default null,
  p_lang_from text default 'de',
  p_lang_to   text default 'en',
  p_set       uuid default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_school  uuid;
  v_set     vocab_sets;
  v_id      uuid;
  v_unit    uuid;
  v_from    text;
  v_to      text;
  v_line    text;
  v_parts   text[];
  v_term    text;
  v_rest    text;
  v_tr      text[];
  v_tm      text[];
  v_added   int := 0;
  v_bad     int := 0;
  v_n       int := 0;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  select school_id into v_school from profiles where id = v_user;
  if v_school is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if p_set is not null then
    -- Nachtragen in eine eigene Liste. Ein mitgelieferter Satz
    -- (owner_id null) fällt hier durch, ein geteilter ebenso: beide
    -- gehören nicht einem allein, und was nicht einem allein gehört,
    -- ändert niemand im Vorbeigehen.
    select * into v_set from vocab_sets
     where id = p_set and owner_id = v_user and not shared;
    if v_set.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    v_id := v_set.id;
  else
    if (select count(*) from vocab_sets
         where owner_id = v_user and not shared) >= 40 then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
    end if;

    v_from := coalesce(nullif(btrim(p_lang_from), ''), 'de');
    v_to   := coalesce(nullif(btrim(p_lang_to),   ''), 'en');

    -- Eine eigene Liste ist eine Unit am Stück: ein Dach, eine
    -- Station. Erst damit erscheint sie in der zweistufigen Ansicht
    -- an derselben Stelle wie die Units des Buchs.
    insert into vocab_units (title, lang_from, lang_to, grade, sort_order,
                             owner_id, school_id)
    values (left(btrim(p_title), 60), v_from, v_to, null, 0, v_user, v_school)
    returning id into v_unit;

    insert into vocab_sets (title, lang_from, lang_to, theme, level,
                            owner_id, school_id, unit_id, sort_order)
    values (left(btrim(p_title), 60), v_from, v_to,
            nullif(btrim(coalesce(p_theme, '')), ''),
            nullif(btrim(coalesce(p_level, '')), ''),
            v_user, v_school, v_unit, 1)
    returning id into v_id;
  end if;

  select coalesce(max(sort_order), 0) into v_n from vocab_items where set_id = v_id;

  foreach v_line in array string_to_array(replace(coalesce(p_text, ''), E'\r', ''), E'\n') loop
    v_line := btrim(v_line);
    continue when v_line = '';

    if position(E'\t' in v_line) > 0 then
      v_parts := string_to_array(v_line, E'\t');
    elsif v_line ~ ' [-–—] ' then
      v_parts := regexp_split_to_array(v_line, ' [-–—] ');
    elsif position(';' in v_line) > 0 then
      v_parts := string_to_array(v_line, ';');
    elsif position('=' in v_line) > 0 then
      v_parts := string_to_array(v_line, '=');
    else
      v_bad := v_bad + 1;
      continue;
    end if;

    v_term := btrim(coalesce(v_parts[1], ''));
    v_rest := btrim(coalesce(v_parts[2], ''));
    if v_term = '' or v_rest = '' or length(v_term) > 60 or length(v_rest) > 120 then
      v_bad := v_bad + 1;
      continue;
    end if;

    v_tm := regexp_split_to_array(v_term, '\s*/\s*');
    v_tr := regexp_split_to_array(v_rest, '\s*/\s*');
    if length(v_tr[1]) > 60 then
      v_bad := v_bad + 1;
      continue;
    end if;

    if (select count(*) from vocab_items where set_id = v_id) >= 300 then
      exit;
    end if;

    v_n := v_n + 1;
    insert into vocab_items (set_id, term, translation, alt, alt_term, sort_order)
    values (v_id, v_tm[1], v_tr[1],
            coalesce(v_tr[2:], '{}'), coalesce(v_tm[2:], '{}'), v_n)
    on conflict (set_id, lower(term)) do update set
      translation = excluded.translation,
      alt         = excluded.alt,
      alt_term    = excluded.alt_term;
    v_added := v_added + 1;
  end loop;

  -- Ein Satz ohne ein einziges Wortpaar ist kein Satz, sondern ein
  -- Missverständnis über das Format. Er wird wieder eingesammelt,
  -- damit die Liste der Lehrkraft nicht mit Leerhülsen zuwächst —
  -- und seit 0150 gilt das für sein Dach genauso.
  if p_set is null and v_added = 0 then
    delete from vocab_sets  where id = v_id;
    delete from vocab_units where id = v_unit;
    return jsonb_build_object('ok', false, 'error', 'no_pairs', 'bad', v_bad);
  end if;

  return jsonb_build_object('ok', true, 'set', v_id, 'unit', v_unit,
                            'added', v_added, 'bad', v_bad);
end;
$$;

revoke all on function vocab_set_import(text, text, text, text, text, text, uuid) from public;
grant execute on function vocab_set_import(text, text, text, text, text, text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) vocab_set_delete — der Schulbestand bleibt stehen
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0150, eine Bedingung mehr. Das Pult zeigt an einer
-- geteilten Station seit Abschnitt 4 kein Löschzeichen mehr — aber
-- ein Knopf, den die Oberfläche nicht zeigt, ist kein Riegel.
--
-- Eine Station aus 33 versehentlich zu löschen wäre für JEDE Klasse
-- der Schule der Verlust ihrer Tiere. Abgeräumt wird der Bestand
-- deshalb dort, wo er auch eingespielt wurde: im Dashboard.
--
-- Zurück kommt „not_found" und nicht „das darfst du nicht" —
-- dieselbe Bauart wie überall hier: fremd und nicht vorhanden sehen
-- gleich aus.
create or replace function vocab_set_delete(p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_unit uuid;
  v_n    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select unit_id into v_unit from vocab_sets
   where id = p_id and owner_id = v_user and not shared;

  delete from vocab_sets where id = p_id and owner_id = v_user and not shared;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_unit is not null
     and not exists (select 1 from vocab_sets where unit_id = v_unit) then
    delete from vocab_units where id = v_unit and owner_id = v_user;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function vocab_set_delete(uuid) from public;
grant execute on function vocab_set_delete(uuid) to authenticated;
