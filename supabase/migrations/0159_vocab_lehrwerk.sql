-- ══════════════════════════════════════════════════════════════
-- Migration 0159 — Was ein ganzes Lehrwerk voraussetzt
-- ══════════════════════════════════════════════════════════════
-- Vorarbeit für 0160 (Green Line 1, Jahrgang 5, 907 Wortpaare in 33
-- Stationen). Zwei Dinge, die mit drei Beispiellisten niemandem
-- auffielen und mit einem Buch sofort:
--
--   1  vocab_norm        Die Schreibweise des Verlags
--   2  wi_ensure_board   Ein neuer Raum ist nicht mehr „alles"
--
-- ── Was hier NICHT mehr steht ─────────────────────────────────
-- Eine frühere Fassung dieser Migration brachte eine dritte
-- Sichtbarkeit mit (`shared`: gehört einer Lehrkraft, sichtbar für
-- ihre Schule). Sönkes Entscheid am 20.09.2026 war dann
-- „mitgeliefert für alle" — und damit beantwortete `shared` eine
-- Frage, die niemand mehr stellt. Zwei Spalten, eine Funktion und
-- fünf geänderte RPCs ohne einen einzigen Nutzer sind kein
-- Vorsprung, sondern fünf Stellen, an denen später etwas schiefgeht.
-- Raus damit, bevor es eingespielt ist.
--
-- Kein DROP — Idempotenz per `create or replace`.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) vocab_norm — zwei Kleinigkeiten aus dem Lehrwerk
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
--                      „skates" schrieb, bekam „fast richtig" statt
--                      „richtig". Jetzt fliegt der ganze
--                      Klammerausdruck heraus.
--
-- Angewachsene Klammern („gym(nasium)") verlieren damit ihre zweite
-- Lesart — die steht deshalb als eigene Fassung in `alt`, und der
-- Umwandler schreibt sie dort hinein.
--
-- Die Reihenfolge ist Absicht: erst die Klammern weg, dann der
-- Artikel. Sonst stünde „(der) Hund" mit einer Klammer da, wo der
-- Artikel-Ausdruck einen Wortanfang erwartet.
--
-- An dieser Funktion hängt kein Index (geprüft: 0130 benutzt sie nur
-- in Rümpfen und in einem `order by`), ein Neuaufbau entfällt.
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
-- 2) wi_ensure_board — ein neuer Raum beginnt mit EINER Station
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0131. Dort stand als Voreinstellung „alle mitgelieferten
-- Sätze", und das war richtig, solange es drei waren: der Testraum,
-- den die Landing mit einem Klick anlegt, sollte nicht leer wirken.
--
-- Mit 0160 sind es sechsunddreißig. Ein neuer Raum käme mit rund
-- tausend Wörtern aus vier Kapiteln daher, und die Lehrkraft dürfte
-- als Erstes fünfunddreißig Kacheln abwählen — die Voreinstellung
-- wäre damit nicht mehr Hilfe, sondern Arbeit.
--
-- Genommen wird deshalb genau EINE Station, und zwar die erste in
-- Buchreihenfolge. Der ursprüngliche Zweck bleibt (der Raum ist
-- nicht leer), die Arbeit verschwindet: wer etwas anderes will,
-- tippt es an, statt aufzuräumen.
--
-- Das Ändern der Auswahl selbst bleibt unberührt — wi_room_setup
-- (0157) setzt sie, wie es sie immer gesetzt hat.
create or replace function wi_ensure_board(p_room uuid)
  returns wi_boards
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_b wi_boards;
begin
  select * into v_b from wi_boards where room_id = p_room;
  if v_b.room_id is null then
    insert into wi_boards (room_id) values (p_room)
    on conflict (room_id) do nothing;
    select * into v_b from wi_boards where room_id = p_room;

    -- Dieselbe Ordnung wie im Pult und auf der Insel (0150):
    -- Jahrgang, dann Unit, dann Station. „Die erste" ist damit die,
    -- die auch oben in der Liste steht — und nicht die, die der
    -- Zufall der Einfügereihenfolge nach vorn gespült hat.
    insert into wi_room_sets (room_id, set_id)
    select p_room, s.id
      from vocab_sets s
      left join vocab_units u on u.id = s.unit_id
     where s.owner_id is null
       and exists (select 1 from vocab_items i where i.set_id = s.id)
     order by coalesce(u.grade, 99), coalesce(u.sort_order, 0),
              coalesce(u.title, s.title), s.sort_order, s.title
     limit 1
    on conflict do nothing;
  end if;
  return v_b;
end;
$$;
