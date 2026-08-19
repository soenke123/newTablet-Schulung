-- ══════════════════════════════════════════════════════════════
-- Migration 0090 — Wem gehört der Raum? (owner_name)
-- ══════════════════════════════════════════════════════════════
-- Auf der Landing steht der Abschnitt „Besuchte Räume" (0088), und
-- darin lauter Kacheln, auf denen der Titel des Raums steht. Der
-- Titel wird von der Lehrkraft vergeben, und er heißt in der Praxis
-- „WordPool", „Stunde 3" oder „Einstieg" — Wörter, die in der
-- zweiten Klasse genauso dastehen. Wer in einer Woche vier Räume
-- besucht hat, kann sie daran nicht auseinanderhalten.
--
-- Die Auskunft, die das leistet, ist die Person davor: „Einstieg
-- (Frau Meyer)". Sie ist auch die einzige, die sich nicht
-- wiederholt — den Skill sieht man am Symbol, das Datum steht schon
-- daneben.
--
-- ── Warum am gemeinsamen Baustein und nicht in skill_my_rooms ──
-- skill_room_json ist die Antwort auf „welcher Raum ist das", und
-- sie wird von BEIDEN Seiten gestellt: sie steckt in der Antwort des
-- Beitritts (und damit im Gerätespeicher, aus dem die Landing ohne
-- Anmeldung ihre Kacheln baut), in skill_view, in skill_room_get
-- und in skill_my_rooms. Stünde der Name nur in skill_my_rooms,
-- hätte ihn genau die Hälfte der Kacheln — die angemeldete —, und
-- welche Hälfte das ist, hinge daran, ob jemand ein Konto hat.
--
-- ── Der Name ist kein Geheimnis, die ID bleibt eines ───────────
-- Der Kommentar an skill_room_json sagt, dass owner_id, school_id
-- und die interne id bewusst draußen bleiben: der Client kennt einen
-- Raum an seinem Code. Das gilt weiter. Der ANZEIGENAME ist etwas
-- anderes — die Lehrkraft steht vor der Klasse, sie hat den Code an
-- die Tafel geschrieben, und ihr Name ist genau das, was ein Kind
-- braucht, um ihren Raum wiederzufinden. Eine ID braucht es dafür
-- nicht, und mit ihr ließe sich anderswo etwas anfragen.
--
-- Die Abfrage läuft als left join: ein Raum ohne auflösbaren
-- Besitzer kann es nach dem `on delete cascade` an owner_id nicht
-- geben, aber ein null im Namen ist die bessere Antwort als eine
-- Zeile, die ganz ausfällt. Der Client fängt es ohnehin ab.
--
-- Kein Grant, kein Policy-Wechsel, keine neue Tabelle: die Funktion
-- ist security definer, die Leserechte auf profiles ändern sich
-- nicht.
-- ══════════════════════════════════════════════════════════════

create or replace function skill_room_json(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object(
    'code',        r.code,
    'title',       r.title,
    'tool_id',     r.tool_id,
    'tool_title',  t.title,
    'tool_icon',   t.icon,
    'tool_folder', t.folder,
    'ask_names',   r.ask_names,
    'is_test',     r.is_test,
    'join_open',   r.join_open,
    'settings',    r.settings,
    'created_at',  r.created_at,
    'expires_at',  r.expires_at,
    'owner_name',  o.display_name,
    'max_participants', t.max_participants
  )
  from skill_rooms r
  join skill_tools t on t.id = r.tool_id
  left join profiles o on o.id = r.owner_id
  where r.id = p_room;
$$;

revoke all on function skill_room_json(uuid) from public;

comment on function skill_room_json(uuid) is
  'Die Raum-Angaben, die BEIDE Seiten sehen dürfen. Enthält den Anzeigenamen der Lehrkraft '
  '(owner_name, 0090) — daran erkennt man einen besuchten Raum wieder —, aber weiterhin weder '
  'owner_id noch school_id noch die interne id: der Client kennt einen Raum an seinem Code.';
