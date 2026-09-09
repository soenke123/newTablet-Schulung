-- ══════════════════════════════════════════════════════════════
-- Migration 0136 — Myth of Wordisland: die eigene Insel
-- ══════════════════════════════════════════════════════════════
-- Bis hierher gibt es Wordisland nur als Raum: eine Lehrkraft
-- öffnet ihn, sechs bis acht Völker erobern eine Insel, nach
-- zwanzig Minuten ist Schluss — und der Lernstand stirbt mit dem
-- Raum, weil vocab_progress am Teilnehmer hängt und der Teilnehmer
-- am Raum.
--
-- Der Wortschatz einer Klasse wächst aber über Jahre. Hier steht
-- deshalb das Dauerhafte daneben:
--
--   · Jede Unit, die eine Lehrkraft in einen Raum spielt, wandert
--     beim Beitritt ADDITIV auf die Insel des Kindes. Eine zweite
--     Lehrkraft im nächsten Schuljahr legt Units dazu; das Kind
--     bekommt keine neue Insel, sondern eine größere.
--   · Jede Vokabel ist ein Tier, das mit dem Lernstand wächst.
--   · Geübt wird ohne Raum, ohne Lehrkraft, jederzeit.
--
-- ── Was hier steht ────────────────────────────────────────────
--   1  wi_solo_learners   Wer übt — und die eigene Insel dazu
--   2  wi_solo_sets       Was freigespielt ist
--   3  wi_solo_progress   Das Langzeit-Fach
--   4  wi_solo_stages     Stufe eines Wortes (die EINE Definition)
--   5  wi_solo_resolve    Konto oder Gerät
--   6  wi_solo_claim      Der Haken beim Raumbeitritt
--   7  wi_solo_open       Für die Kachel auf der Landing
--   8  wi_solo_view       Die ganze Insel
--   9  wi_solo_settings   Units, Richtung, Modus
--  10  wi_solo_pick_next / wi_solo_next
--  11  wi_solo_record     Richtig +1, falsch −1
--  12  wi_solo_answer     Der ganze Antwortweg
--
-- ── Konto und Gerät sind ZWEI Inseln ──────────────────────────
-- Ein Klassensatz-Tablet wird geteilt, und ein Kind ohne Konto ist
-- der Normalfall (Regel 2 des Sicherheitsmodells). Also dasselbe
-- Muster wie in lib/room.js: „Der Token ist das Konto, das es
-- nicht gibt."
--
--   abgemeldet → wi_solo_learners.token   = localStorage
--   angemeldet → wi_solo_learners.user_id = auth.uid()
--
-- Das sind zwei getrennte Zeilen, und sie treffen sich nie. Wer
-- sich anmeldet, überschreibt die Geräte-Insel nicht; wer sich
-- abmeldet, bekommt sie zurück. Es gibt bewusst KEINEN Weg,
-- Fortschritt von der einen in die andere zu tragen — auf einem
-- geteilten Gerät wäre das Übernehmen fremder Arbeit, und zwar in
-- beide Richtungen.
--
-- ── Der Raum-Lernstand kommt NICHT mit ────────────────────────
-- vocab_progress wird hier nicht angefasst und nicht ausgelesen.
-- Auf der Insel fängt jedes Wort als Ei an. Das ist die Metapher
-- und nicht Vergesslichkeit: was in einer Runde unter Zeitdruck
-- zweimal richtig war, ist nicht gelernt, und ein Kind, dessen
-- Insel am ersten Tag halb ausgewachsen dasteht, hat nichts mehr
-- zu tun.
--
-- ── Ein Tier je VOKABEL, nicht je Richtung ────────────────────
-- Der Karteikasten führt „Haus → house" und „house → Haus"
-- getrennt (0130, und das bleibt richtig). Auf der Insel steht
-- trotzdem EIN Tier je Wort, und seine Stufe ist die SCHWÄCHERE
-- der beiden Richtungen. Ein Wort schlüpft also erst, wenn es in
-- beide Richtungen einmal saß.
--
-- Folge, die man kennen muss: wer nur in Raum-Runden mit fester
-- Richtung übt, bekommt nie einen Schlüpfer. Deshalb ist im
-- Solo-Menü 'mixed' die Voreinstellung.
--
-- Kein DROP — Idempotenz per `if not exists` und `on conflict`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wi_solo_learners — wer übt
-- ─────────────────────────────────────────────────────────────
-- Die Zeile trägt zweierlei: die Identität (Token oder Konto) und
-- den laufenden Übungszustand. Getrennte Tabellen wären sauberer
-- gedacht, aber es gibt je Lernenden genau eine Übung — eine
-- zweite Tabelle mit einer 1:1-Beziehung ist ein Join, der nie
-- etwas herausfindet.
--
-- seed ist die Form der Insel. Er wird EINMAL gewürfelt und nie
-- wieder angefasst: eine Insel, die sich beim Dazulernen umformt,
-- ist nicht mehr die eigene.
create table if not exists wi_solo_learners (
  id              uuid primary key default gen_random_uuid(),
  token           text unique,
  user_id         uuid references profiles(id) on delete cascade,
  seed            int  not null default (floor(random() * 1000000))::int,
  settings        jsonb not null default '{}'::jsonb,
  -- Die laufende Aufgabe. Gleiche Felder wie wi_players (0131) —
  -- was geprüft wird, weiß immer der Server.
  current_item    uuid references vocab_items(id) on delete set null,
  current_dir     text check (current_dir is null or current_dir in ('de_en', 'en_de')),
  current_stage   text check (current_stage is null or current_stage in ('type', 'spell', 'choice')),
  current_options text[] not null default '{}',
  lock_until      timestamptz,
  correct_count   int not null default 0,
  wrong_count     int not null default 0,
  wrong_run       int not null default 0,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  -- Ohne das eine oder das andere ist die Zeile nicht wiederzufinden
  -- und damit Müll.
  constraint wi_solo_learners_id_needed check (token is not null or user_id is not null)
);

comment on table wi_solo_learners is
  'Eine eigene Insel. Entweder an einem Konto (user_id) oder an einem Geräte-Token — nie an beidem. '
  'Die zwei Wege sind zwei Zeilen; zwischen ihnen wandert nichts.';
comment on column wi_solo_learners.seed is
  'Die Form der Insel. Einmal gewürfelt, nie geändert — sonst wäre es nicht mehr dieselbe Insel.';
comment on column wi_solo_learners.settings is
  'Was das Kind im eigenen Menü gewählt hat: {sets:[uuid], dir, mode}. Leeres sets = alle freigespielten.';

-- Ein Konto hat genau eine Insel. Partiell, weil user_id bei
-- Geräte-Inseln null ist und NULL sich in einem gewöhnlichen
-- unique nicht doppelt anfühlt — hier soll es aber gar nicht erst
-- zur Frage kommen.
create unique index if not exists wi_solo_learners_user_idx
  on wi_solo_learners(user_id) where user_id is not null;

alter table wi_solo_learners enable row level security;
grant select, insert, update, delete on wi_solo_learners to service_role;


-- ─────────────────────────────────────────────────────────────
-- 2) wi_solo_sets — was freigespielt ist
-- ─────────────────────────────────────────────────────────────
-- from_room mit `on delete set null` und NICHT cascade: ein Raum
-- verfällt nach 60 Tagen (skill_rooms.expires_at), die
-- Freischaltung darf das nicht mitnehmen. Sie ist der ganze Zweck
-- dieser Migration.
--
-- set_id dagegen cascadet sehr wohl: löscht eine Lehrkraft ihre
-- private Unit, gibt es die Wörter nicht mehr, und was es nicht
-- gibt, kann man nicht üben.
create table if not exists wi_solo_sets (
  learner_id uuid not null references wi_solo_learners(id) on delete cascade,
  set_id     uuid not null references vocab_sets(id) on delete cascade,
  from_room  uuid references skill_rooms(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (learner_id, set_id)
);

comment on table wi_solo_sets is
  'Freigespielte Units. Wächst additiv über Räume, Lehrkräfte und Schuljahre — es gibt keinen Weg, '
  'hier etwas wegzunehmen außer dem Löschen der Unit selbst.';
comment on column wi_solo_sets.from_room is
  'Woher die Freischaltung kam. Nur Herkunftsnotiz: set null beim Ablauf des Raums, '
  'damit die Unit bleibt.';

alter table wi_solo_sets enable row level security;
grant select, insert, update, delete on wi_solo_sets to service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) wi_solo_progress — das Langzeit-Fach
-- ─────────────────────────────────────────────────────────────
-- Der Kopf von 0130 hat es angekündigt: „Die Abstände sind auf eine
-- Unterrichtsstunde geschnitten und nicht auf Wochen — das
-- Langzeit-Fach bringt das Solo-Werkzeug mit." Hier ist es.
--
-- Gleiche Form wie vocab_progress, aber eine eigene Tabelle: die
-- Abstände sind andere (Tage statt Minuten), der Rückschritt ist
-- ein anderer (−1 statt 0), und der Schlüssel ist ein anderer
-- (Lernender statt Teilnehmer). Drei Unterschiede in einer
-- gemeinsamen Tabelle wären drei Sonderfälle in jeder Abfrage.
create table if not exists wi_solo_progress (
  learner_id uuid not null references wi_solo_learners(id) on delete cascade,
  item_id    uuid not null references vocab_items(id) on delete cascade,
  dir        text not null check (dir in ('de_en', 'en_de')),
  box        int  not null default 0 check (box between 0 and 4),
  due_at     timestamptz not null default now(),
  seen       int  not null default 0,
  wrong      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (learner_id, item_id, dir)
);

comment on table wi_solo_progress is
  'Langzeit-Karteikasten der eigenen Insel. box 0..4 = die fünf Stufen des Tiers, '
  'aber je RICHTUNG — die Stufe des Tiers ist das Minimum beider (wi_solo_stages).';

create index if not exists wi_solo_progress_due_idx
  on wi_solo_progress(learner_id, due_at);

alter table wi_solo_progress enable row level security;
grant select, insert, update, delete on wi_solo_progress to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) wi_solo_stages — die Stufe eines Wortes
-- ─────────────────────────────────────────────────────────────
-- Die EINE Definition. Sie steht hier und nirgends sonst: dass ein
-- Tier so weit ist wie seine schwächere Richtung, ist eine
-- Spielregel, und eine Spielregel, die an zwei Stellen steht, ist
-- nach der nächsten Änderung zwei Spielregeln.
--
-- Ein Wort ohne jede Zeile ist Stufe 0 — ein Ei. Genau so kommen
-- frisch freigespielte Units an.
--
-- p_item null = alle Wörter der freigespielten Units (für die
-- Insel), sonst genau eines (für die Antwort).
create or replace function wi_solo_stages(p_learner uuid, p_item uuid default null)
  returns table (item_id uuid, stage int)
  stable
  set search_path = public
  language sql
as $$
  select i.id,
         least(
           coalesce(max(p.box) filter (where p.dir = 'de_en'), 0),
           coalesce(max(p.box) filter (where p.dir = 'en_de'), 0)
         )::int
    from wi_solo_sets s
    join vocab_items i on i.set_id = s.set_id
    left join wi_solo_progress p
           on p.learner_id = s.learner_id and p.item_id = i.id
   where s.learner_id = p_learner
     and (p_item is null or i.id = p_item)
   group by i.id;
$$;

comment on function wi_solo_stages(uuid, uuid) is
  'Stufe 0..4 je Wort: das Minimum beider Richtungen. Ein Wort schlüpft erst, wenn es in '
  'beide Richtungen einmal saß. Einzige Definition dieser Regel.';


-- ─────────────────────────────────────────────────────────────
-- 5) wi_solo_resolve — Konto oder Gerät
-- ─────────────────────────────────────────────────────────────
-- Angemeldet gewinnt IMMER, und der mitgeschickte Token wird dann
-- gar nicht erst angesehen. Sonst hinge es am Zufall, ob jemand
-- nach dem Anmelden noch seine Geräte-Insel bekommt — und auf einem
-- Klassensatz-Tablet wäre das die Insel des Vormittagskurses.
create or replace function wi_solo_resolve(p_token text)
  returns wi_solo_learners
  stable
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_l    wi_solo_learners;
begin
  if v_user is not null then
    select * into v_l from wi_solo_learners where user_id = v_user;
    return v_l;
  end if;

  if p_token is null or btrim(p_token) = '' then
    return v_l;   -- alle Felder null, id is null
  end if;

  select * into v_l from wi_solo_learners where token = p_token and user_id is null;
  return v_l;
end;
$$;


-- Anlegen. Getrennt von resolve, weil das Ansehen einer Insel
-- keine anlegen darf: sonst sammelte jeder Aufruf der Landing eine
-- leere Zeile an, und die Kachel „Meine Insel" erschiene für alle,
-- auch für die, die nie in einem Raum waren.
create or replace function wi_solo_create()
  returns wi_solo_learners
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_l    wi_solo_learners;
begin
  -- Konto-Inseln bekommen KEINEN Token: er wäre ein zweiter
  -- Schlüssel zu denselben Daten, der im localStorage eines
  -- geteilten Tablets liegen bliebe.
  insert into wi_solo_learners (token, user_id)
  values (case when v_user is null then encode(gen_random_bytes(24), 'hex') end, v_user)
  returning * into v_l;

  return v_l;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 6) wi_solo_claim — der Haken beim Raumbeitritt
-- ─────────────────────────────────────────────────────────────
-- Das Herzstück des additiven Wortschatzes. Aufgerufen vom Tablet
-- IM RAUM, mit dem Raum-Token (dem Geheimnis des Teilnehmers) und
-- dem Insel-Token.
--
-- ⚠️ Die Reihenfolge der beiden ist kein Zufall: `p_token` ist hier
-- der RAUM-Token und nicht der der Insel. Die Werkzeug-
-- Schnittstelle (lib/tool.js) stellt jedem Aufruf der
-- Teilnehmer-Rolle `p_token` voran — eine Funktion, deren erster
-- Parameter etwas anderes ist, wäre von dort schlicht nicht
-- erreichbar. Gerufen wird sie NUR aus dieser Rolle.
--
-- Idempotent: `on conflict do nothing`. Das Tablet ruft im Takt von
-- anderthalb Minuten erneut auf, weil eine Lehrkraft ihre Units
-- MITTEN in der Runde wechseln darf (wi_room_setup) — und das soll
-- billig sein.
--
-- Angelegt wird die Insel nur, wenn es wirklich etwas zu holen
-- gibt. Ein Raum ohne Units (oder der Raum eines anderen
-- Werkzeugs, in dem es wi_room_sets gar nicht gibt) hinterlässt
-- nichts — und die Kachel erscheint erst, wenn Wörter da sind.
create or replace function wi_solo_claim(p_token text, p_solo text default null)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_l     wi_solo_learners;
  v_sets  uuid[];
  v_added int := 0;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select array_agg(set_id) into v_sets from wi_room_sets where room_id = v_p.room_id;
  if v_sets is null or array_length(v_sets, 1) is null then
    -- Nichts zu holen. Ausdrücklich KEIN Fehler: die Lehrkraft hat
    -- ihre Units nur noch nicht gewählt, und das Tablet ruft gleich
    -- wieder an.
    return jsonb_build_object('ok', true, 'added', 0, 'token', null);
  end if;

  v_l := wi_solo_resolve(p_solo);
  if v_l.id is null then
    v_l := wi_solo_create();
  end if;

  insert into wi_solo_sets (learner_id, set_id, from_room)
  select v_l.id, s, v_p.room_id from unnest(v_sets) s
  on conflict (learner_id, set_id) do nothing;
  get diagnostics v_added = row_count;

  update wi_solo_learners set last_seen_at = now() where id = v_l.id;

  return jsonb_build_object(
    'ok', true,
    'added', v_added,
    -- Nur bei einer Geräte-Insel, und dann muss das Tablet ihn
    -- behalten: ohne den Token findet niemand die Insel wieder.
    'token', v_l.token,
    'words', (select count(*) from wi_solo_sets ss
                join vocab_items i on i.set_id = ss.set_id
               where ss.learner_id = v_l.id));
end;
$$;

revoke all on function wi_solo_claim(text, text) from public;
grant execute on function wi_solo_claim(text, text) to anon, authenticated;

comment on function wi_solo_claim(text, text) is
  'p_token ist der RAUM-Token (Reihenfolge von lib/tool.js erzwungen), p_solo der Insel-Token. '
  'Additiv und idempotent; legt die Insel nur an, wenn der Raum wirklich Units hat.';


-- ─────────────────────────────────────────────────────────────
-- 7) wi_solo_open — für die Kachel
-- ─────────────────────────────────────────────────────────────
-- Die billige Auskunft: gibt es eine Insel, und was steht darauf?
-- Ohne die Wortliste — die Landing zeichnet keine Insel, sie
-- zeigt eine Kachel.
create or replace function wi_solo_open(p_token text default null)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l wi_solo_learners;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    -- Kein Fehler. „Du warst noch in keinem Raum" ist eine
    -- Antwort und kein Fehlschlag.
    return jsonb_build_object('ok', true, 'learner', null);
  end if;

  update wi_solo_learners set last_seen_at = now() where id = v_l.id;

  return jsonb_build_object('ok', true, 'learner', jsonb_build_object(
    'token',    v_l.token,
    'seed',     v_l.seed,
    'settings', v_l.settings,
    'words',    (select count(*) from wi_solo_stages(v_l.id)),
    'grown',    (select count(*) from wi_solo_stages(v_l.id) where stage >= 3),
    'sets',     coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'level', s.level, 'theme', s.theme,
               'count', (select count(*) from vocab_items i where i.set_id = s.id))
             order by s.level, s.title)
        from wi_solo_sets ss join vocab_sets s on s.id = ss.set_id
       where ss.learner_id = v_l.id), '[]'::jsonb)));
end;
$$;

revoke all on function wi_solo_open(text) from public;
grant execute on function wi_solo_open(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) wi_solo_view — die ganze Insel
-- ─────────────────────────────────────────────────────────────
-- Ein Aufruf beim Öffnen, danach rechnet das Gerät selbst weiter:
-- es gibt hier KEINEN Poller. Niemand außer dem Kind selbst ändert
-- etwas an dieser Insel, also gibt es auch nichts abzuholen — und
-- 28 Tablets, die alle drei Sekunden 400 Wörter ziehen, wären der
-- teuerste Weg, immer dasselbe zu erfahren.
--
-- `i`/`s` statt `item_id`/`stage`: bei 800 Wörtern ist der Name
-- der Spalte die Hälfte der Übertragung.
create or replace function wi_solo_view(p_token text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l wi_solo_learners;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update wi_solo_learners set last_seen_at = now() where id = v_l.id;

  return (wi_solo_open(p_token)) || jsonb_build_object(
    'ok', true,
    'words_list', coalesce((
      select jsonb_agg(jsonb_build_object('i', item_id, 's', stage))
        from wi_solo_stages(v_l.id)), '[]'::jsonb),
    'due', (select count(*) from wi_solo_due(v_l.id)));
end;
$$;

revoke all on function wi_solo_view(text) from public;
grant execute on function wi_solo_view(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 9) Die gewählten Units
-- ─────────────────────────────────────────────────────────────
-- Leere Auswahl heißt „alles, was freigespielt ist". Das ist der
-- Zustand am ersten Tag, und er soll ohne einen einzigen Klick
-- funktionieren.
create or replace function wi_solo_chosen(p_learner uuid)
  returns uuid[]
  stable
  set search_path = public
  language sql
as $$
  -- Verglichen wird als TEXT und nicht als uuid: was in settings
  -- steht, hat wi_solo_settings zwar geprüft, aber ein Cast, der
  -- bei einem einzigen krummen Eintrag die ganze Übung mit einer
  -- Fehlermeldung beendet, ist der falsche Ort für Strenge.
  select coalesce(
    nullif(array(
      select ss.set_id
        from wi_solo_sets ss
        join wi_solo_learners l on l.id = ss.learner_id
       where ss.learner_id = p_learner
         and coalesce(l.settings->'sets', '[]'::jsonb) ? ss.set_id::text
    ), '{}'),
    array(select set_id from wi_solo_sets where learner_id = p_learner));
$$;

comment on function wi_solo_chosen(uuid) is
  'Die Units, auf denen gerade geübt wird — die Auswahl geschnitten auf das Freigespielte. '
  'Leer oder nur Fremdes gewählt = alles Freigespielte. Der Schnitt ist die Sicherung: '
  'eine Unit, die nicht in wi_solo_sets steht, kommt hier nie heraus.';


-- Was jetzt fällig wäre. Nur fürs Anzeigen („12 Wörter warten") —
-- die Auswahl des nächsten Wortes macht wi_solo_pick_next selbst.
create or replace function wi_solo_due(p_learner uuid)
  returns table (item_id uuid, dir text)
  stable
  set search_path = public
  language sql
as $$
  select p.item_id, p.dir
    from wi_solo_progress p
    join vocab_items i on i.id = p.item_id
   where p.learner_id = p_learner
     and i.set_id = any(wi_solo_chosen(p_learner))
     and p.due_at <= now();
$$;


-- ─────────────────────────────────────────────────────────────
-- 10) wi_solo_settings — das eigene Menü
-- ─────────────────────────────────────────────────────────────
-- Dieselben drei Schalter wie am Pult: Units, Richtung, Modus.
-- Beschränkt ist nur die Unit-Auswahl, und zwar auf das
-- Freigespielte — der Rest ist die Entscheidung des Kindes, wie es
-- üben will, und die geht niemanden sonst etwas an.
--
-- null heißt „nicht anfassen". So kann das Menü einen einzelnen
-- Schalter schicken, ohne die anderen mitzuschleppen.
create or replace function wi_solo_settings(
  p_token text,
  p_sets  uuid[] default null,
  p_dir   text   default null,
  p_mode  text   default null
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l    wi_solo_learners;
  v_new  jsonb;
  v_keep uuid[];
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_dir is not null and p_dir not in ('de_en', 'en_de', 'mixed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_mode is not null and p_mode not in ('type', 'choice') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_new := v_l.settings;

  if p_sets is not null then
    -- Fremde Units fallen still heraus statt den Aufruf abzulehnen:
    -- eine Unit kann zwischen dem Aufbau des Menüs und dem Tippen
    -- gelöscht worden sein, und dann soll der Rest trotzdem gelten.
    select array_agg(s) into v_keep
      from unnest(p_sets) s
     where s in (select set_id from wi_solo_sets where learner_id = v_l.id);
    v_new := v_new || jsonb_build_object('sets',
               coalesce(to_jsonb(v_keep), '[]'::jsonb));
  end if;
  if p_dir  is not null then v_new := v_new || jsonb_build_object('dir',  p_dir);  end if;
  if p_mode is not null then v_new := v_new || jsonb_build_object('mode', p_mode); end if;

  -- Die laufende Aufgabe fällt weg. Sonst steht nach dem Abwählen
  -- von Unit 3 noch ein Wort aus Unit 3 auf dem Schirm, und die
  -- Antwort darauf zählt.
  update wi_solo_learners
     set settings        = v_new,
         current_item    = null,
         current_dir     = null,
         current_stage   = null,
         current_options = '{}',
         last_seen_at    = now()
   where id = v_l.id;

  return jsonb_build_object('ok', true, 'settings', v_new);
end;
$$;

revoke all on function wi_solo_settings(text, uuid[], text, text) from public;
grant execute on function wi_solo_settings(text, uuid[], text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 11) Welches Wort kommt jetzt
-- ─────────────────────────────────────────────────────────────
-- Dieselbe Reihenfolge wie vocab_pick_next (0130 §10): erst was
-- fällig ist, dann was noch nie dran war, dann der Rest nach
-- Fälligkeit. Eigene Fassung, weil der Karteikasten ein anderer
-- ist — nicht, weil die Regel eine andere wäre.
create or replace function wi_solo_pick_next(p_learner uuid)
  returns table (item_id uuid, dir text)
  volatile
  set search_path = public
  language sql
as $$
  select i.id, d.dir
    from vocab_items i
    cross join lateral (
      select unnest(case when coalesce(
                           (select l.settings->>'dir' from wi_solo_learners l
                             where l.id = p_learner), 'mixed') = 'mixed'
                         then array['de_en', 'en_de']
                         else array[(select l.settings->>'dir' from wi_solo_learners l
                                      where l.id = p_learner)] end) as dir
    ) d
    left join wi_solo_progress pr
           on pr.learner_id = p_learner
          and pr.item_id = i.id
          and pr.dir = d.dir
   where i.set_id = any(wi_solo_chosen(p_learner))
   order by
     case when pr.learner_id is null then 1
          when pr.due_at <= now()    then 0
          else 2 end,
     coalesce(pr.due_at, now()),
     random()
   limit 1;
$$;


create or replace function wi_solo_next(p_learner uuid)
  returns void
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_next record;
  v_mode text;
  v_opts text[] := '{}';
begin
  select coalesce(l.settings->>'mode', 'type') into v_mode
    from wi_solo_learners l where l.id = p_learner;

  select * into v_next from wi_solo_pick_next(p_learner);

  -- Zwei Zuweisungen statt einer im CASE: eine record-Variable in
  -- einem CASE-Zweig, der nicht gewählt wird, wirft trotzdem
  -- „record not assigned yet" (Regel: feedback_plpgsql_record_in_case).
  if v_next.item_id is null then
    update wi_solo_learners
       set current_item = null, current_dir = null,
           current_stage = null, current_options = '{}'
     where id = p_learner;
    return;
  end if;

  if v_mode = 'choice' then
    v_opts := vocab_choices(wi_solo_chosen(p_learner), v_next.item_id, v_next.dir, 8);
  end if;

  update wi_solo_learners
     set current_item    = v_next.item_id,
         current_dir     = v_next.dir,
         current_stage   = case when v_mode = 'choice' then 'choice' else 'type' end,
         current_options = v_opts
   where id = p_learner;
end;
$$;


-- Die Aufgabe für das Gerät. Wie wi_task_json (0131 §11), nur um
-- Wort und Stufe erweitert: das Kind soll SEIN Tier sehen, während
-- es antwortet.
create or replace function wi_solo_task_json(p_l wi_solo_learners)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select case when p_l.current_item is null then 'null'::jsonb
              else jsonb_build_object(
                     'item',    p_l.current_item,
                     'prompt',  vocab_prompt(p_l.current_item, p_l.current_dir),
                     'dir',     p_l.current_dir,
                     'stage',   p_l.current_stage,
                     'level',   (select stage from wi_solo_stages(p_l.id, p_l.current_item)),
                     'options', to_jsonb(p_l.current_options))
         end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 12) wi_solo_record — das Langzeit-Fach
-- ─────────────────────────────────────────────────────────────
-- Richtig: ein Fach weiter. Falsch: ein Fach ZURÜCK, nicht auf
-- null. Das ist der eine bewusste Unterschied zu vocab_record.
--
-- Im Raum dauert eine Runde zwanzig Minuten, da ist das harte
-- Zurücksetzen richtig — was man gerade nicht konnte, ist auch
-- gleich wieder dran. Die Insel begleitet ein Schuljahr. Ein Tier,
-- das nach vier Wochen Arbeit wegen eines Vertippers wieder als Ei
-- daliegt, ist der Moment, in dem ein Kind aufhört.
--
-- Die Abstände sind Tage und keine Minuten — das ist der Sinn des
-- Wortes „Langzeit". Sie stehen als Reihe da und nicht als Formel,
-- damit man sie nachbessern kann, ohne zu rechnen.
create or replace function wi_solo_record(
  p_learner uuid,
  p_item    uuid,
  p_dir     text,
  p_ok      boolean
)
  returns void
  volatile
  set search_path = public
  language sql
as $$
  insert into wi_solo_progress (learner_id, item_id, dir, box, due_at, seen, wrong, updated_at)
  values (
    p_learner, p_item, p_dir,
    case when p_ok then 1 else 0 end,
    now() + case when p_ok then interval '1 day' else interval '10 minutes' end,
    1,
    case when p_ok then 0 else 1 end,
    now()
  )
  on conflict (learner_id, item_id, dir) do update set
    box = case when p_ok then least(wi_solo_progress.box + 1, 4)
               else greatest(wi_solo_progress.box - 1, 0) end,
    due_at = now() + case
      when not p_ok then interval '10 minutes'
      else (array[interval '10 minutes', interval '1 day', interval '3 days',
                  interval '7 days',     interval '21 days'])
             [least(wi_solo_progress.box + 1, 4) + 1]
      end,
    seen       = wi_solo_progress.seen + 1,
    wrong      = wi_solo_progress.wrong + case when p_ok then 0 else 1 end,
    updated_at = now();
$$;


-- ─────────────────────────────────────────────────────────────
-- 13) wi_solo_answer — der ganze Antwortweg
-- ─────────────────────────────────────────────────────────────
-- Baugleich zu wi_answer (0131 §13) und mit derselben dreistufigen
-- Prüfung: exact → richtig, near → Auswahl aus Schreibweisen, miss
-- → Auswahl aus acht Wörtern. Geprüft wird hier und nie im Gerät.
--
-- Was fehlt, fehlt mit Absicht: kein Feld, keine Serie, kein Volk.
-- Im Einzelspieler gibt es nichts zu erobern.
--
-- Was dazukommt: stufe_vorher und stufe_nachher. Das Gerät braucht
-- beide, weil das Wachsen des Tiers die eigentliche Rückmeldung
-- ist — „richtig" steht nur daneben.
create or replace function wi_solo_answer(p_token text, p_input text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l      wi_solo_learners;
  v_sets   uuid[];
  v_grade  text;
  v_stage  text;
  v_ok     boolean := false;
  v_result text;
  v_sol    text;
  v_item   uuid;
  v_dir    text;
  v_before int;
  v_after  int;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_l.current_item is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_l.lock_until is not null and v_l.lock_until > now() then
    return jsonb_build_object('ok', false, 'error', 'too_fast',
                              'locked_for', ceil(extract(epoch from v_l.lock_until - now()))::int);
  end if;

  v_item  := v_l.current_item;
  v_dir   := v_l.current_dir;
  v_stage := v_l.current_stage;
  v_sets  := wi_solo_chosen(v_l.id);
  v_grade := vocab_grade(v_item, v_dir, p_input);

  -- In einer Auswahl gibt es kein „fast": was nicht die Lösung ist,
  -- ist daneben. Sonst löste ein Schreibweisen-Ablenker eine zweite
  -- Auswahl aus, und das Kind käme nie heraus. (Wie 0131.)
  if v_stage <> 'type' then
    v_ok := (v_grade = 'exact');
    v_result := case when v_ok then 'correct' else 'wrong' end;
  elsif v_grade = 'exact' then
    v_ok := true;
    v_result := 'correct';
  elsif v_grade = 'near' then
    v_result := 'spell';
  else
    v_result := 'choice';
  end if;

  -- Zwischenstufe: dieselbe Vokabel, jetzt mit Auswahl. Kein
  -- Fehler, kein Wachsen, keine Sperre — die Antwort ist offen.
  if v_result in ('spell', 'choice') then
    update wi_solo_learners
       set current_stage   = v_result,
           current_options = case when v_result = 'spell'
                                  then vocab_spellings(
                                         (vocab_answers(v_item, v_dir))[1],
                                         btrim(coalesce(p_input, '')))
                                  else vocab_choices(v_sets, v_item, v_dir, 8)
                             end,
           last_seen_at    = now()
     where id = v_l.id;

    select * into v_l from wi_solo_learners where id = v_l.id;
    return jsonb_build_object('ok', true, 'result', v_result,
                              'task', wi_solo_task_json(v_l));
  end if;

  -- Entschieden. Die Lösung wird JETZT gelesen — nach wi_solo_next
  -- steht in current_item das nächste Wort, und das Gerät bekäme
  -- die Auflösung einer Frage, die es noch nicht gesehen hat.
  if not v_ok then
    v_sol := (vocab_answers(v_item, v_dir))[1];
  end if;

  select stage into v_before from wi_solo_stages(v_l.id, v_item);
  perform wi_solo_record(v_l.id, v_item, v_dir, v_ok);
  select stage into v_after  from wi_solo_stages(v_l.id, v_item);

  if v_ok then
    update wi_solo_learners
       set correct_count = correct_count + 1,
           wrong_run     = 0,
           lock_until    = null
     where id = v_l.id;
  else
    -- Wachsende Sperre gegen schnelles Durchraten (Muster aus 0124).
    update wi_solo_learners
       set wrong_count = wrong_count + 1,
           wrong_run   = wrong_run + 1,
           lock_until  = now() + make_interval(secs => least(2 * (wrong_run + 1), 10))
     where id = v_l.id;
  end if;

  perform wi_solo_next(v_l.id);
  select * into v_l from wi_solo_learners where id = v_l.id;

  return jsonb_build_object(
    'ok', true,
    'result',     v_result,
    'solution',   v_sol,
    'item',       v_item,
    'level_before', v_before,
    'level_after',  v_after,
    'locked_for', greatest(0, ceil(extract(epoch from
                    coalesce(v_l.lock_until, now()) - now()))::int),
    'task',       wi_solo_task_json(v_l));
end;
$$;

revoke all on function wi_solo_answer(text, text) from public;
grant execute on function wi_solo_answer(text, text) to anon, authenticated;


-- Die erste Aufgabe holen. Eigener Aufruf, weil „üben" ein Anfang
-- ist und keine Antwort: wi_solo_answer setzt eine laufende
-- Aufgabe voraus.
create or replace function wi_solo_start(p_token text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l wi_solo_learners;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform wi_solo_next(v_l.id);
  select * into v_l from wi_solo_learners where id = v_l.id;
  update wi_solo_learners set last_seen_at = now() where id = v_l.id;

  return jsonb_build_object('ok', true, 'task', wi_solo_task_json(v_l));
end;
$$;

revoke all on function wi_solo_start(text) from public;
grant execute on function wi_solo_start(text) to anon, authenticated;
