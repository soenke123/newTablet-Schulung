-- ═══════════════════════════════════════════════════════════════
-- 0154 — Die Wörter einer Station ansehen
-- ═══════════════════════════════════════════════════════════════
-- Sönkes Wunsch: „in der Lehrer ansicht an jeder Station ein icon,
-- was zu der vokabelliste führt … simple einfache tabelle, in der
-- man die vokabeln gut lesen kann auch bei langen listen > als 30."
--
-- Am Pult steht bisher nur, WIE VIELE Wörter in einer Station liegen
-- („30 Wörter · Klasse 5/6"). Welche das sind, sieht die Lehrkraft
-- erst, wenn die Klasse spielt — und dann ist es für die Entscheidung
-- „nehmen wir Station 2 oder 3" zu spät. Eine eingeführte Liste nach
-- dem Import noch einmal gegenzulesen geht heute gar nicht.
--
-- Zwei Funktionen, wie schon 0131 es für die drei Listen-Verben
-- getan hat:
--
--   vocab_set_words(p_set)          — die Inhalts-Schicht
--   wi_set_words(p_code, p_set)     — der Durchreicher fürs Werkzeug
--
-- Der Durchreicher sieht überflüssig aus und ist es nicht: die
-- Werkzeug-Schnittstelle (lib/tool.js) stellt JEDEM Aufruf der
-- Beamer-Rolle `p_code` voran. Eine Funktion ohne diesen Parameter
-- ist aus einem Werkzeug heraus schlicht nicht erreichbar. Dieselbe
-- Begründung steht in 0131, Abschnitt 16 — und sie gilt hier
-- unverändert.
--
-- KEIN Lernstand darin. Die Übersicht beantwortet „welche Wörter
-- stehen hier", nicht „wer kann sie". Wer was gerissen hat, zeigt
-- wi_hard_words am Rundenende, und das ohne Namen (0131/0153). Zwei
-- Fragen, zwei Funktionen.


-- ─────────────────────────────────────────────────────────────
-- 1) vocab_set_words — ein Satz mit seinen Wortpaaren
-- ─────────────────────────────────────────────────────────────
-- Sichtbar ist, was auch vocab_sets_list zeigt: mitgeliefert
-- (owner_id null) oder die eigene Liste. Fremd und nicht vorhanden
-- sehen gleich aus — dieselbe Bauart wie in vocab_set_delete.
--
-- Die Nebenformen fahren MIT (`a`/`at`). Sie sind Teil des Inhalts:
-- „pupil / student" steht im Import in EINER Zeile, und eine
-- Übersicht, die nur „pupil" zeigt, behauptet, „student" wäre
-- falsch. Angezeigt werden sie klein neben dem Hauptwort.
--
-- Sortiert wie überall: sort_order, bei Gleichstand alphabetisch.
-- Das ist die Reihenfolge des Imports und damit die des Buchs.
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
           'mine',   case when s.owner_id is null then '0' else '1' end,
           -- Der Kopf der Übersicht sagt, wo die Station hängt. Ohne
           -- Unit (eigene Liste ohne Dach) steht dort null, und das
           -- Gerät lässt die Zeile weg.
           'unit',   u.id,
           'utitle', u.title,
           'grade',  u.grade)
    into v_set
    from vocab_sets s
    left join vocab_units u on u.id = s.unit_id
   where s.id = p_set
     and (s.owner_id is null or s.owner_id = v_user);

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
-- 2) wi_set_words — derselbe Blick aus dem Werkzeug heraus
-- ─────────────────────────────────────────────────────────────
-- Zwilling von wi_sets_list/wi_set_import/wi_set_delete (0131).
create or replace function wi_set_words(p_code text, p_set uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if wi_owned_room(p_code) is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return vocab_set_words(p_set);
end;
$$;

revoke all on function wi_set_words(text, uuid) from public;
grant execute on function wi_set_words(text, uuid) to authenticated;

comment on function wi_set_words(text, uuid) is
  'vocab_set_words für die Beamer-Rolle: p_code bindet den Aufruf an den eigenen Raum.';
