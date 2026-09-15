-- ══════════════════════════════════════════════════════════════
-- Migration 0150 — Jahrgang → Unit → Station
-- ══════════════════════════════════════════════════════════════
-- 0130 hat den Vokabelsatz flach angelegt: Titel, `theme`, `level`.
-- Für drei mitgelieferte Themenlisten reichte das. Das eingeführte
-- Englischbuch ist aber dreistufig — Jahrgang, Unit, Station —, und
-- mit ~1000 Wörtern je Jahrgang wären das ~40 Listen nebeneinander.
-- Weder die Unit-Leiste der eigenen Insel (0142) noch das Wörter-
-- Fenster am Pult (0131) sind damit zu bedienen.
--
-- ── Der Entwurfsentscheid ─────────────────────────────────────
-- Die STATION bleibt der Baustein. Sie ist weiterhin `vocab_sets`,
-- und alles, was an Set-IDs hängt — wi_solo_sets, wi_solo_progress,
-- wi_room_sets — bleibt unangetastet. Die UNIT kommt als Dach
-- darüber und trägt zwei Dinge: die Gruppierung in der Oberfläche
-- und den Inselschlüssel.
--
-- Damit merkt der Spielserver von der neuen Ebene GAR NICHTS. Wer
-- eine ganze Unit wählt, schickt weiterhin die Liste ihrer Stationen.
--
-- ── „Unit am Stück" braucht keine Spalte ──────────────────────
-- Eine Unit mit genau EINER Station IST eine Unit am Stück. Das
-- Gerät zeigt dann die Unit-Zeile selbst als Schalter, ohne
-- Aufklapp-Pfeil. Kein `is_whole`-Merker, keine Konvention über
-- leere Titel, kein zweiter Fall im Server — und der Textblock-
-- Import der Lehrkraft muss nichts Neues können.
--
-- ── Was hier steht ────────────────────────────────────────────
--   1  vocab_island_key   Die eine Definition des Inselschlüssels
--   2  vocab_units        Das Dach
--   3  vocab_sets         Zwei Spalten dazu
--   4  Bestand umhängen   Ohne einen einzigen verlorenen Lernstand
--   5  vocab_sets_list    Rumpf aus 0130, fünf Felder mehr
--   6  vocab_set_import   Rumpf aus 0130, legt die Unit mit an
--   7  vocab_set_delete   Rumpf aus 0130, räumt leere Units ab
--   8  wi_solo_open       Rumpf aus 0145, dieselben fünf Felder
--
-- ── Was hier NICHT steht ──────────────────────────────────────
--   · Kein neues Import-Format. Überschriften (`# Unit` / `##
--     Station`) kommen, wenn das Buch kommt — vorher gibt es nichts
--     zu füttern.
--   · Keine Insel je Jahrgang. Der Schlüssel wird hier nur
--     GESCHRIEBEN; gelesen wird er, wenn wi_solo_learners von „ein
--     Kind" zu „eine Insel eines Kindes" wird.
--
-- Kein DROP — Idempotenz per `if not exists`, `add column if not
-- exists` und `on conflict`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) vocab_island_key — die eine Definition
-- ─────────────────────────────────────────────────────────────
-- 'en:5', 'la:6', ohne Jahrgang 'en:x'. Sprache UND Jahrgang, weil
-- beides eine eigene Insel rechtfertigt: ein Jahrgang füllt sie
-- allein (sie ist bei 660 Wörtern ausgewachsen), und Latein neben
-- Englisch auf derselben Insel wäre ein Sprachensalat.
--
-- immutable, weil die generierte Spalte darunter das verlangt —
-- und sie verlangt es zu Recht: der Schlüssel darf sich nie ändern,
-- solange Sprache und Jahrgang gleich bleiben.
create or replace function vocab_island_key(p_lang text, p_grade int)
  returns text
  immutable
  set search_path = public
  language sql
as $$
  select coalesce(nullif(btrim(lower(p_lang)), ''), 'en')
      || ':' || coalesce(p_grade::text, 'x');
$$;

comment on function vocab_island_key(text, int) is
  'Der Inselschlüssel: Sprache und Jahrgang, z. B. en:5. Die EINE Definition — '
  'vocab_units.island_key ist daraus generiert und kann ihr nicht widersprechen.';


-- ─────────────────────────────────────────────────────────────
-- 2) vocab_units — das Dach über den Stationen
-- ─────────────────────────────────────────────────────────────
-- Dieselben zwei Regeln wie vocab_sets (0130): Titellänge, und
-- entweder mitgeliefert (owner und school null) oder jemandes
-- Liste (beides gesetzt).
--
-- `grade` darf null sein. Eine eigene Liste einer Lehrkraft
-- („Klassenarbeit Dienstag") gehört keinem Jahrgang, und ihr einen
-- zu erfinden wäre eine Behauptung.
--
-- island_key ist GENERIERT und nicht gesetzt. Eine Spalte, die
-- jemand von Hand füllen kann, ist eine zweite Wahrheit neben der
-- Funktion — und beim ersten Import, der sie vergisst, landet eine
-- Unit auf einer Insel, die es nicht gibt.
create table if not exists vocab_units (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  lang_from  text not null default 'de',
  lang_to    text not null default 'en',
  grade      int,
  island_key text generated always as (vocab_island_key(lang_to, grade)) stored,
  sort_order int not null default 0,
  owner_id   uuid references profiles(id) on delete cascade,
  school_id  uuid references schools(id)  on delete cascade,
  created_at timestamptz not null default now(),
  constraint vocab_units_title_len check (char_length(title) between 1 and 60),
  constraint vocab_units_grade_ck  check (grade is null or grade between 1 and 13),
  constraint vocab_units_owned     check ((owner_id is null) = (school_id is null))
);

comment on table vocab_units is
  'Eine Unit des Lehrwerks. Ihre Stationen sind vocab_sets mit unit_id. '
  'Eine Unit mit genau einer Station ist eine Unit am Stück.';
comment on column vocab_units.island_key is
  'Generiert aus lang_to und grade. Trägt später die Zuordnung „welche Insel" — '
  'hier wird er nur geschrieben.';
comment on column vocab_units.grade is
  'Jahrgang. null bei eigenen Listen, die keinem zugeordnet sind.';

create index if not exists vocab_units_owner_idx  on vocab_units(owner_id);
create index if not exists vocab_units_island_idx on vocab_units(island_key);

alter table vocab_units enable row level security;
grant select, insert, update, delete on vocab_units to service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) vocab_sets — zwei Spalten dazu
-- ─────────────────────────────────────────────────────────────
-- `theme` und `level` bleiben stehen. Sie sind seit 0130 in den drei
-- mitgelieferten Sätzen gefüllt und werden im Pult angezeigt; sie zu
-- entfernen wäre ein DROP ohne Gewinn.
alter table vocab_sets add column if not exists
  unit_id uuid references vocab_units(id) on delete cascade;
alter table vocab_sets add column if not exists
  sort_order int not null default 0;

comment on column vocab_sets.unit_id is
  'Die Unit, deren Station dieser Satz ist. Zeigt nach 0150 immer irgendwohin.';
comment on column vocab_sets.sort_order is
  'Die Stationsnummer innerhalb der Unit.';

create index if not exists vocab_sets_unit_idx on vocab_sets(unit_id, sort_order);


-- ─────────────────────────────────────────────────────────────
-- 4) Der Bestand bekommt seine Form
-- ─────────────────────────────────────────────────────────────
-- ⚠️ Umgehängt wird, nicht neu angelegt. An den drei Set-IDs aus
-- 0130 hängen wi_solo_progress (der Lernstand jedes Kindes),
-- wi_solo_sets (was freigespielt ist) und wi_room_sets (die Auswahl
-- laufender Räume). Ein neues Set mit denselben Wörtern wäre für
-- jedes Kind ein Neuanfang bei null — und die Tiere auf der Insel
-- wären weg.
--
-- Sönkes Vorgabe für die Testdaten: Jahrgang 5 · Unit „Test" ·
-- Station 1 bis 3. Die drei Themenlisten sind genau das, also werden
-- sie es auch — mit sprechendem Zusatz, damit in der Leiste nicht
-- dreimal dasselbe Wort steht.
insert into vocab_units (id, title, lang_from, lang_to, grade, sort_order)
values ('b0000000-0000-4000-8000-000000000001', 'Test', 'de', 'en', 5, 1)
on conflict (id) do update set
  title      = excluded.title,
  lang_from  = excluded.lang_from,
  lang_to    = excluded.lang_to,
  grade      = excluded.grade,
  sort_order = excluded.sort_order;

-- `do update` und nicht `do nothing`: eine Korrektur an einer schon
-- gelaufenen Migration käme sonst nie in der Datenbank an
-- (Regel: feedback_stale_reference_data_do_nothing).
update vocab_sets set
  unit_id    = 'b0000000-0000-4000-8000-000000000001',
  sort_order = v.st,
  title      = v.t
  from (values
    ('a0000000-0000-4000-8000-000000000001'::uuid, 1, 'Station 1 — Schule'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, 2, 'Station 2 — Zuhause'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, 3, 'Station 3 — Essen')
  ) as v(id, st, t)
 where vocab_sets.id = v.id;

-- Jede schon importierte eigene Liste wird eine Unit am Stück.
-- Ohne das fiele sie aus der zweistufigen Ansicht heraus — und das
-- wäre für die Lehrkraft, die sie angelegt hat, ein Datenverlust,
-- obwohl nichts verloren ist.
--
-- Idempotent durch die Bedingung selbst: beim zweiten Lauf findet
-- `unit_id is null` nichts mehr.
do $$
declare
  r     record;
  v_new uuid;
begin
  for r in select * from vocab_sets where unit_id is null loop
    insert into vocab_units (title, lang_from, lang_to, grade, sort_order,
                             owner_id, school_id)
    values (r.title, r.lang_from, r.lang_to, null, 0, r.owner_id, r.school_id)
    returning id into v_new;

    update vocab_sets set unit_id = v_new, sort_order = 1 where id = r.id;
  end loop;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 5) vocab_sets_list — fünf Felder mehr
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0130 (höchste bestehende Fassung; Regel:
-- feedback_shop_state_merge_regressions).
--
-- FLACH bleiben, das Gerät gruppiert. Genau das Muster von 0142, wo
-- `words_list` das Feld `u` dazubekam. Ein verschachteltes Format
-- („units, darin sets") wäre hübscher zu lesen und hätte zwei
-- Nachteile: ein Gerät mit älterer tool.js verstünde die Antwort gar
-- nicht mehr, und die Sortierung läge dann im Server fest.
--
-- Sortiert wird über eigene Spalten und nicht über die jsonb-Felder:
-- `x->>'grade'` ist Text, und dort steht '10' vor '5'.
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
                 -- Sortierschlüssel und Anzeigemerkmal in einem:
                 -- '0' stellt die mitgelieferten nach vorn.
                 'mine',   case when s.owner_id is null then '0' else '1' end,
                 'count',  (select count(*) from vocab_items i where i.set_id = s.id),
                 -- Neu in 0150. `unit` ist der Gruppierungsschlüssel
                 -- des Geräts; steht dort null, behandelt es den Satz
                 -- als eigene Einzel-Unit und zeigt weiter eine
                 -- flache Zeile.
                 'unit',    u.id,
                 'utitle',  u.title,
                 'grade',   u.grade,
                 'island',  u.island_key,
                 'station', s.sort_order
               ) as x,
               case when s.owner_id is null then 0 else 1 end as o_mine,
               -- Ohne Jahrgang ans Ende, nicht an den Anfang: die
               -- eigenen Listen sollen die Buchjahrgänge nicht
               -- auseinanderschieben.
               coalesce(u.grade, 99)       as o_grade,
               coalesce(u.sort_order, 0)   as o_unit,
               coalesce(u.title, s.title)  as o_utitle,
               s.sort_order                as o_station,
               s.title                     as o_title
          from vocab_sets s
          left join vocab_units u on u.id = s.unit_id
         where s.owner_id is null or s.owner_id = v_user
      ) t
  ), '[]'::jsonb));
end;
$$;

revoke all on function vocab_sets_list() from public;
grant execute on function vocab_sets_list() to authenticated;

comment on function vocab_sets_list() is
  'Alle sichtbaren Sätze, flach, mit ihrer Unit (unit/utitle/grade/island/station). '
  'Das Gerät gruppiert daraus Jahrgang → Unit → Station.';

-- wi_sets_list(p_code) (0131) ruft diese Funktion auf und hängt nur
-- `chosen` an. Sie erbt die fünf Felder damit ohne eine Zeile
-- Änderung und wird hier NICHT angefasst.


-- ─────────────────────────────────────────────────────────────
-- 6) vocab_set_import — legt die Unit gleich mit an
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0130, drei Stellen geändert:
--
--   1) Eine neue Liste bekommt eine eigene Unit (am Stück).
--   2) Das Nachtragen in eine bestehende Liste rührt die Unit nicht
--      an — es ändert ja nur ihre Wörter.
--   3) Der Rückzieher bei „keine einzige Zeile lesbar" nimmt die
--      frisch angelegte Unit mit. Eine Unit ohne Station ist eine
--      Leerhülse mit Dach.
--
-- ⚠️ Die SIGNATUR bleibt Zeichen für Zeichen dieselbe. Ein
-- zusätzlicher Parameter mit Vorgabewert wäre in Postgres eine
-- ÜBERLADUNG und keine Ersetzung: die alte Fassung bliebe stehen,
-- und welche von beiden ein Aufruf trifft, hinge an der Zahl der
-- mitgegebenen Argumente. Aufräumen ließe sich das nur mit einem
-- `drop function` (Regel: feedback_supabase_no_drop_statements).
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
    -- (owner_id null) fällt hier durch: er gehört allen, und was
    -- allen gehört, ändert niemand im Vorbeigehen.
    select * into v_set from vocab_sets where id = p_set and owner_id = v_user;
    if v_set.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    v_id := v_set.id;
  else
    if (select count(*) from vocab_sets where owner_id = v_user) >= 40 then
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
-- 7) vocab_set_delete — leere Units mit abräumen
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0130, eine Zeile mehr. Ohne sie bliebe nach dem Löschen
-- der letzten Station ihr Dach stehen: eine Unit ohne ein einziges
-- Wort, die in der Leiste als leere Zeile erscheint und sich nicht
-- entfernen lässt.
--
-- Abgeräumt wird nur, was wirklich leer ist — eine Unit mit mehreren
-- Stationen überlebt das Löschen einer davon.
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

  -- Nur eigene. Ein mitgelieferter Satz hat keinen Besitzer und ist
  -- damit hier nicht auffindbar — dieselbe Bauart wie überall:
  -- fremd und nicht vorhanden sehen gleich aus.
  select unit_id into v_unit from vocab_sets where id = p_id and owner_id = v_user;

  delete from vocab_sets where id = p_id and owner_id = v_user;
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


-- ─────────────────────────────────────────────────────────────
-- 8) wi_solo_open — dieselben fünf Felder für die Insel
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0145 und NICHT aus 0136: dort kam das Level dazu, und
-- wer hier die ältere Fassung nähme, nähme es wieder weg
-- (Regel: feedback_shop_state_merge_regressions).
--
-- Geändert ist allein die `sets`-Liste. Sie ist die Grundlage der
-- Unit-Leiste rechts (0142) und muss dieselbe Gruppierung tragen wie
-- das Wörter-Fenster am Pult — sonst sieht ein Kind seine Wörter
-- anders geordnet als die Lehrkraft, die sie freigeschaltet hat.
--
-- Die Sortierung stand bisher auf `s.level, s.title`. `level` ist
-- Text ('5/6') und war nie als Ordnung gedacht; jetzt ordnet der
-- Jahrgang, dann die Unit, dann die Station.
create or replace function wi_solo_open(p_token text default null)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l      wi_solo_learners;
  v_player jsonb;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    -- Kein Fehler. „Du warst noch in keinem Raum" ist eine
    -- Antwort und kein Fehlschlag.
    return jsonb_build_object('ok', true, 'learner', null);
  end if;

  update wi_solo_learners set last_seen_at = now() where id = v_l.id;
  v_player := wi_solo_level_refresh(v_l.id);

  return jsonb_build_object('ok', true, 'learner', jsonb_build_object(
    'token',    v_l.token,
    'seed',     v_l.seed,
    'settings', v_l.settings,
    'words',    (select count(*) from wi_solo_stages(v_l.id)),
    'grown',    (select count(*) from wi_solo_stages(v_l.id) where stage >= 3),
    'sets',     coalesce((
      select jsonb_agg(x order by o_grade, o_unit, o_utitle, o_station, o_title)
        from (
          select jsonb_build_object(
                   'id',      s.id,
                   'title',   s.title,
                   'level',   s.level,
                   'theme',   s.theme,
                   'count',   (select count(*) from vocab_items i where i.set_id = s.id),
                   'unit',    u.id,
                   'utitle',  u.title,
                   'grade',   u.grade,
                   'island',  u.island_key,
                   'station', s.sort_order
                 ) as x,
                 coalesce(u.grade, 99)      as o_grade,
                 coalesce(u.sort_order, 0)  as o_unit,
                 coalesce(u.title, s.title) as o_utitle,
                 s.sort_order               as o_station,
                 s.title                    as o_title
            from wi_solo_sets ss
            join vocab_sets s on s.id = ss.set_id
            left join vocab_units u on u.id = s.unit_id
           where ss.learner_id = v_l.id
        ) t), '[]'::jsonb),
    'player',   v_player));
end;
$$;

revoke all on function wi_solo_open(text) from public;
grant execute on function wi_solo_open(text) to anon, authenticated;

-- wi_solo_view (0136/0142) hängt sich über
-- `(wi_solo_open(p_token)) || jsonb_build_object(…)` an und muss
-- deshalb hier NICHT angefasst werden. Ihr `words_list` trägt seit
-- 0142 die SET-Nummer je Wort (`u`) — zusammen mit der Liste oben
-- kennt das Gerät damit auch die Unit jedes Tieres, ohne dafür ein
-- Feld mehr je Wort zu übertragen.
