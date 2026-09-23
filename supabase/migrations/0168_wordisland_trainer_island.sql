-- ══════════════════════════════════════════════════════════════
-- Migration 0168 — Wordisland: die Trainer-Insel der Lehrkraft
-- ══════════════════════════════════════════════════════════════
-- Sönke, 23.09.2026: „die Lehrkraft braucht eine Show-Insel (nur über
-- Multiplayer erreichbar), um den Schülerinnen zu zeigen, wie man
-- diese nutzen kann."
--
-- Bis jetzt ging das nicht, und zwar aus einem Grund, der im Code
-- gut versteckt liegt: `wi_solo_claim` (0136, zuletzt 0157) ist die
-- EINZIGE Stelle, an der eine Insel Stationen bekommt — und sie
-- nimmt als erstes Argument den RAUM-Token eines Teilnehmers. Eine
-- Lehrkraft hat keinen. Öffnet sie `insel.html`, findet
-- `wi_solo_open` über `auth.uid()` ihre Konto-Insel ohne eine
-- einzige Station und sagt wahrheitsgemäß „Deine Insel gibt es noch
-- nicht".
--
-- ── Die Trainer-Insel IST die Konto-Insel ─────────────────────
-- Entschieden mit Sönke (AskUserQuestion, 23.09.2026): kein dritter
-- Datensatz neben Konto und Gerät und keine gewürfelten Lernstände.
-- Die Lehrkraft bekommt auf ihrer eigenen Insel genau die Stationen
-- DIESES Raums — also dieselben Wörter, die die Klasse gerade hat.
-- Am Anfang liegen dort nur Eier, und das ist der bessere Vortrag:
-- zwei richtige Antworten vor der Klasse, und das Ei schlüpft samt
-- Feier. Eine vorgefüllte Insel könnte man zeigen, aber nicht
-- vormachen.
--
-- Nebenwirkung, die ausdrücklich gewollt ist: die Lehrkraft kann auf
-- dieser Insel selbst üben, und sie wächst über Jahre wie die der
-- Kinder (`wi_solo_sets` ist additiv).
--
-- ── Warum eine eigene Funktion und nicht ein Parameter mehr ───
-- `wi_solo_claim(p_token, p_solo)` steigt in der ersten Zeile über
-- `skill_participants` ein; ein zusätzlicher Weg „oder Lehrkraft per
-- Code" wäre eine zweite Identitätsprüfung in derselben Funktion —
-- und die wird beim nächsten Umbau verwechselt. Presenter-Aufrufe
-- heißen in diesem Werkzeug ohnehin `wi_room_*` und nehmen `p_code`
-- zuerst (wi_room_setup, wi_room_start, wi_room_set_end): die
-- Werkzeug-Schnittstelle stellt in der Beamer-Rolle jedem Aufruf
-- `p_code` voran (lib/tool.js, presenterActions), eine Funktion mit
-- anderer Reihenfolge wäre von dort nicht erreichbar.
--
-- ── Kein Token in der Antwort ─────────────────────────────────
-- `wi_solo_create()` gibt Konto-Inseln bewusst keinen Token (0137).
-- Hier kann also keiner entstehen, und das Gerät soll auch keinen
-- ablegen: `rememberSolo` täte das bei einer angemeldeten Lehrkraft
-- ohnehin nicht (lib/room.js), aber die Antwort trägt ihn gar nicht
-- erst.
--
-- ── Ein Raum ohne Wörter ist kein Fehler ──────────────────────
-- Dann hat die Lehrkraft nur noch keine Stationen gewählt. Die
-- Antwort ist `ok:true` mit `added:0`/`words:0`, und das Gerät sagt
-- „wähle erst Wörter aus" statt eines Fehlertexts. Angelegt wird in
-- diesem Fall auch keine Insel-Zeile — dieselbe Zusage wie in
-- `wi_solo_claim`: die Kachel erscheint erst, wenn Wörter da sind.
--
-- Kein DROP — die Funktion ist neu (Regel:
-- feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

create or replace function wi_room_solo_claim(p_code text)
  returns jsonb
  volatile
  security definer
  -- ⚠️ `extensions` gehört dazu: der Zweig „noch keine Insel" ruft
  -- wi_solo_create(), und dort liegt gen_random_bytes in schema
  -- extensions (siehe 0137, feedback_pgcrypto_lives_in_extensions).
  -- Die gerufene Funktion bringt ihren search_path selbst mit; die
  -- Aufnahme hier ist der Gürtel zum Hosenträger und kostet nichts.
  set search_path = public, extensions
  language plpgsql
as $$
declare
  -- Prüft die Lehrkraft (owner_id = auth.uid()) und stempelt dabei
  -- presenter_seen_at (0131). In der Lobby ohne Bedeutung — und nur
  -- dort steht der Knopf, weil eine laufende Runde endet, sobald das
  -- Pult zwei Minuten nicht gesehen wurde (wi_maybe_advance).
  v_room    uuid := wi_owned_room(p_code);
  v_l       wi_solo_learners;
  v_sets    uuid[];
  v_added   int := 0;
  v_new_ids uuid[];
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select array_agg(set_id) into v_sets from wi_room_sets where room_id = v_room;
  if v_sets is null or array_length(v_sets, 1) is null then
    -- Kein Fehler, siehe Kopf.
    return jsonb_build_object('ok', true, 'added', 0, 'words', 0);
  end if;

  -- p_token = null: die Auflösung nimmt dann auth.uid(), und die ist
  -- hier nicht null (wi_owned_room hätte sonst abgelehnt).
  v_l := wi_solo_resolve(null::text);
  if v_l.id is null then
    v_l := wi_solo_create();
  end if;

  with inserted as (
    insert into wi_solo_sets (learner_id, set_id, from_room)
    select v_l.id, s, v_room from unnest(v_sets) s
    on conflict (learner_id, set_id) do nothing
    returning set_id
  )
  select array_agg(set_id), count(*)::int
    into v_new_ids, v_added
    from inserted;

  update wi_solo_learners set last_seen_at = now() where id = v_l.id;

  return jsonb_build_object(
    'ok',    true,
    'added', coalesce(v_added, 0),
    -- Die Zahl, an der das Gerät entscheidet, ob es überhaupt
    -- hinübergeht: eine Insel ohne ein einziges Wort ist nichts zum
    -- Vorzeigen. Gezählt wird der ganze Bestand und nicht nur das
    -- Neue — eine Lehrkraft, die schon vier Units hat, soll auch aus
    -- einem Raum ohne Wörter auf ihre Insel kommen.
    'words', (select count(*) from wi_solo_sets ss
                join vocab_items i on i.set_id = ss.set_id
               where ss.learner_id = v_l.id));
end;
$$;

comment on function wi_room_solo_claim(text) is
  'Schaltet der LEHRKRAFT die Stationen ihres Raums auf ihrer eigenen Konto-Insel frei (0168). '
  'Die Trainer-Insel ist die echte Konto-Insel — kein dritter Datensatz und keine erfundenen '
  'Lernstaende. Additiv und idempotent; ein Raum ohne Stationen ist ok:true mit words:0.';

revoke all on function wi_room_solo_claim(text) from public;
grant execute on function wi_room_solo_claim(text) to authenticated;
