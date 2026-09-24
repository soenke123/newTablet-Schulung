-- ══════════════════════════════════════════════════════════════
-- Migration 0170 — Platz für das richtige Lehrwerk
-- ══════════════════════════════════════════════════════════════
-- Sönke, 24.09.2026: „Bei Wordisland habe ich die falschen
-- Vokabellisten hoch geladen. Ich habe jetzt die richtigen Listen
-- der Bücher für die Jahrgänge 5, 6 und 7 hoch geladen (g9). … Wir
-- müssen die jetzigen Listen vollständig ersetzen."
--
-- Diese Migration räumt ab, was dafür im Weg steht. Den Inhalt
-- bringen 0171 (Green Line G9 1), 0172 (Band 2) und 0173 (Band 3) —
-- 2761 Wortpaare in 136 Stationen unter 33 Kapiteln, und danach
-- stehen drei Inseln im Meer: 'en:5', 'en:6', 'en:7'.
--
-- ── Drei Dinge, in dieser Reihenfolge ─────────────────────────
--   1  Die Längengrenze von vocab_items: 60 → 120 Zeichen
--   2  Der alte Bestand (0160/0162/0163) geht von Bord
--   3  Die eigenen Inseln bekommen ihre Auswahl zurückgesetzt
--
-- Punkt 3 ist der einzige, der nicht von allein passiert — und
-- genau darum steht er hier. Siehe unten.
--
-- ── Warum Löschen und nicht Verstecken ────────────────────────
-- Dieselbe Antwort wie in 0161: ein Merker „nicht mehr anzeigen"
-- hätte die alten Wörter in jeder Abfrage als Sonderfall
-- hinterlassen, und die Tiere auf den Inseln wären geblieben —
-- sichtbar, aber ohne Wort dahinter. Weg ist ehrlicher als
-- versteckt. Der Verlust ist ausdrücklich in Ordnung: bis heute
-- wurde das Spiel nur erprobt (Sönke: „Das das Spiel bisher nur
-- getestet wurde, ist dieser Verlust nicht schlimm").
--
-- Kein DROP von Strukturen. Die eine `alter table … drop
-- constraint` in Abschnitt 1 steht in einem DO-Block hinter einer
-- Abfrage auf pg_catalog — das Muster von 0135
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Die deutsche Seite ist manchmal eine Erklärung
-- ─────────────────────────────────────────────────────────────
-- vocab_items.term und .translation dürfen seit 0130 sechzig
-- Zeichen haben. Das reicht für ein Wort und nicht für das, was
-- ein Lehrwerk sonst noch in diese Spalte schreibt:
--
--   cyber bully → jemand, der andere in sozialen Netzwerken
--                 belästigt oder mobbt                      (61)
--   call-in     → Sendung, bei der sich das Publikum
--                 telefonisch beteiligen kann               (61)
--   kimbap      → koreanischer Snack aus Seegras, Reis,
--                 Rindfleisch, Käse und Ei                  (61)
--   mudlark     → jemand, der im Schlamm nach Sachen sucht,
--                 die er dann verkaufen kann                (68)
--   haggis      → Haggis (schottisches Gericht aus in einem
--                 Schafsmagen gekochten Schafsinnereien
--                 und Haferschrot)                          (95)
--   cream tea   → Cream Tea (südwestenglische Spezialität: …)(84)
--
-- Sechs Einträge in drei Bänden, und bei DREIEN davon war es genau
-- EIN Zeichen zu viel. Der Umwandler hat sie bisher stillschweigend
-- weggelassen — das ist die schlechteste der möglichen Antworten:
-- in der Datenbank fehlt ein Wort, und niemand sieht warum.
--
-- 120 und nicht „unbegrenzt": der längste echte Eintrag hat 95
-- Zeichen, der Rest ist Luft. Eine Spalte ohne Grenze wäre die
-- Einladung, einen ganzen Merksatz hineinzuschreiben — und der
-- steht dann als Kachel unter den acht Auswahlmöglichkeiten.
--
-- vocab_sets.title und vocab_units.title bleiben bei 60. Titel sind
-- Titel; der längste in den drei Bänden hat 54 Zeichen.
--
-- Bestehende Zeilen können die neue Grenze nicht verletzen (sie ist
-- weiter als die alte), ein `not valid` erübrigt sich also.
do $$
declare
  v_name text;
  v_def  text;
begin
  foreach v_name in array array['vocab_items_term_len', 'vocab_items_trans_len'] loop
    select pg_get_constraintdef(c.oid) into v_def
      from pg_catalog.pg_constraint c
     where c.conname  = v_name
       and c.conrelid = 'public.vocab_items'::regclass;

    if v_def is not null and position('120' in v_def) = 0 then
      execute format('alter table vocab_items drop constraint %I', v_name);
      v_def := null;
    end if;

    if v_def is null then
      execute format(
        'alter table vocab_items add constraint %I check (char_length(%I) between 1 and 120)',
        v_name,
        case when v_name = 'vocab_items_term_len' then 'term' else 'translation' end);
    end if;
  end loop;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 2) Der alte Bestand geht von Bord
-- ─────────────────────────────────────────────────────────────
-- Genannt werden die Nummern und nicht „alles mit grade 5 oder 6".
-- Der Unterschied ist derselbe wie in 0161: eine gezielte Anweisung
-- statt einer mutigen. Eine Lehrkraft, die sich inzwischen eine
-- eigene Liste für Klasse 6 angelegt hat, verliert sie hier NICHT —
-- ihre Unit steht in keiner dieser beiden Reihen.
--
-- ── Was dabei mitgeht ─────────────────────────────────────────
-- Die Fremdschlüssel erledigen es von allein, geprüft in
-- pg_catalog:
--
--   vocab_sets        über unit_id            → cascade
--   vocab_items       über set_id             → cascade
--   vocab_progress    über item_id            → cascade  (Karteikasten im Raum)
--   wi_solo_progress  über item_id            → cascade  (Langzeit-Fach der Insel)
--   wi_solo_sets      über set_id             → cascade  (Freigespieltes)
--   wi_room_sets      über set_id             → cascade  (Auswahl laufender Räume)
--   wi_round_words    über item_id            → cascade  (Strichliste der Runde)
--   wi_players.current_item       → set null  (0131)
--   wi_solo_learners.current_item → set null  (0136)
--
-- Die beiden letzten sind der Grund, warum das auch MITTEN in einer
-- Stunde nichts zerreißt: wer gerade eines dieser Wörter vor sich
-- hat, bekommt statt eines Fehlers die nächste Aufgabe.

-- Green Line 1 (Migration 0160, Titel „Hello!" aus 0162)
delete from vocab_units where id in (
  'a72c8599-b342-4b2d-a80c-b2530b7bcbe7',   -- Hello!
  'b535cb16-66f3-4c5a-8e69-7c9471212c90',   -- Unit 1 — A new school
  'a15492d8-9859-4c36-9687-be401a39182e',   -- Media smart 1
  '4adb6477-9f23-4ae4-87c9-4e07b76fdb01',   -- Unit 2 — At home
  '046b88bd-ab5f-4639-bbb8-a9853eb14183',   -- Across cultures 1
  '236f84ae-5c59-4149-91d4-683b25dd911d',   -- Unit 3 — Our Greenwich
  'dc76b64d-588a-4380-8e74-c949319577a1',   -- Across cultures 2
  'abda5f16-6660-46c0-8f20-bc2843963e82',   -- Unit 4 — Happy Birthday
  '735c75e1-21ff-4149-bdbb-0a240fd5c145'    -- Trailer
);

-- Green Line 2 (Migration 0163)
delete from vocab_units where id in (
  '3b9f6bc7-1a8b-4694-a6b0-837e8fd03a7f',   -- Welcome back!
  'e95eb07e-4c2c-4b01-87b6-d1e2cc5b28e0',   -- Unit 1 — The new boy
  'e5602995-2a9a-4ab5-96d5-87f249220192',   -- Media smart 1
  'f46932bb-21ca-4e15-9e00-aaec2e4b7114',   -- Across cultures 1
  'aad40ab2-cb6e-4faf-9329-6acdea0608cf',   -- Unit 2 — London: Wow!
  '15e3aae1-f011-48ce-baa4-b9db4c6ba292',   -- Unit 3 — Star of the internet
  'e1f47cf0-f4b2-4d15-902b-3f8b71b4c9d2',   -- Across cultures 2
  '55f22880-2da8-48dc-85a0-08aef57003d1',   -- Unit 4 — What's your sport?
  'f6e0387f-e9bc-46c9-aa16-74d176454164',   -- Unit 5 — Scotland, here we come!
  'b82d3af9-bd6c-42e1-89c3-6aa9697a033e',   -- Text 1
  '4fbf2f9f-67ca-41ab-a786-ba88387a033f',   -- Text 2
  '856632ce-77b0-48b2-bea9-6ef128ce5fa3',   -- Text 3
  '69aff8cd-e85e-407b-89dd-34bb56bc9cd2',   -- Text 4
  '23c94865-926a-4845-800d-11bafb601333',   -- Text 5
  '34377593-086a-4e7f-aee2-9b86901599e0'    -- Text 6
);

-- Dieselbe Sicherung wie in 0161: ein mitgeliefertes Dach ohne eine
-- einzige Station ist immer ein Rest und nie Absicht. Sie greift
-- auch dann, wenn jemand eine dieser Stationen zwischendurch an
-- eine andere Unit gehängt hat.
delete from vocab_units u
 where u.owner_id is null
   and not exists (select 1 from vocab_sets s where s.unit_id = u.id);


-- ─────────────────────────────────────────────────────────────
-- 3) Die eigenen Inseln — der Teil, der nicht von allein geht
-- ─────────────────────────────────────────────────────────────
-- Alles oben hängt an einem Fremdschlüssel. Eines nicht:
-- `wi_solo_learners.settings->'sets'` ist eine blanke JSON-Liste von
-- Stationsnummern. Kein Fremdschlüssel sieht sie an, also überlebt
-- sie das Löschen — als Liste von Nummern, die es nicht mehr gibt.
--
-- Seit 0169 heißt „der Schlüssel 'sets' ist da, aber es kommt nichts
-- dabei heraus" ausdrücklich NICHTS GEWÄHLT (und nicht mehr
-- „alles"). Ein Kind mit einer alten Auswahl bekäme also eine leere
-- Insel — und zwar dauerhaft: selbst wenn seine Lehrkraft neue
-- Stationen freischaltet, steht in `settings.sets` weiter die alte
-- Auswahl, und die Schnittmenge bleibt leer. Von außen sieht das
-- aus wie ein kaputtes Spiel.
--
-- Also: wessen Auswahl komplett ins Leere zeigt, verliert den
-- Schlüssel und fängt wieder bei „noch nie gewählt = alles
-- Freigespielte" an. Wer noch mindestens eine lebende Station
-- gewählt hat (eine eigene Liste seiner Lehrkraft), behält seine
-- Auswahl — deshalb `not exists` und nicht pauschal.
update wi_solo_learners l
   set settings = l.settings - 'sets'
 where l.settings ? 'sets'
   and not exists (
     select 1
       from wi_solo_sets ss
      where ss.learner_id = l.id
        and coalesce(l.settings->'sets', '[]'::jsonb) ? ss.set_id::text);

-- Der Rundenbalken zählt gezogene Kopien dieser Runde (0141). Nach
-- einem vollständigen Austausch des Inhalts zählt er Kopien von
-- Wörtern, die es nicht mehr gibt — der Balken stünde beim nächsten
-- Öffnen irgendwo in der Mitte, ohne dass jemand etwas geübt hätte.
-- `pass_no` bleibt stehen: die Rundennummer ist eine Chronik und
-- behauptet nichts über den Inhalt.
update wi_solo_learners set pass_done = 0 where pass_done <> 0;


-- ── Ein zweiter Lauf ──────────────────────────────────────────
-- Abschnitt 1 prüft, bevor er etwas tut. Abschnitt 2 findet beim
-- zweiten Mal nichts mehr. Abschnitt 3 räumt beim zweiten Mal genau
-- die Auswahlen ab, die inzwischen wieder ins Leere zeigen — das
-- ist dieselbe Aussage und kein neuer Schaden. Supabase spielt jede
-- Datei ohnehin genau einmal ein.
