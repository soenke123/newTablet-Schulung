-- ═══════════════════════════════════════════════════════════════
-- 0143 · Myth of Wordisland — du selbst stehst auf deiner Insel
-- ═══════════════════════════════════════════════════════════════
-- Sönke, 11.09.2026: „Ich würde gerne, dass man selbst auch auf der
-- Insel repräsentiert wird. Hier beginnt nun das eigene Level
-- system. Schritt 1 ist aber erstmal, dass man ein Charakter und ein
-- Schiff bekommt. Diese sind Default von den Brokkoli Giraffen.
-- Durchs Klicken aufs Schiff oder auf die Figur öffnet sich ein
-- Modal. […] Man kann hier die Fraktion frei wählen."
--
-- Bis hierher war die eigene Insel ein Schaukasten: lauter Vokabeln,
-- die herumlaufen, und niemand, der dort wohnt. Figur und Schiff
-- sind der Unterschied zwischen „meine Vokabeln" und „mein Ort".
--
-- ── Was die Datenbank davon überhaupt mitbekommt ──────────────
-- Fast nichts, und das ist die eigentliche Entscheidung dieser
-- Migration. Wie die Figur läuft, wie das Schiff die Insel
-- umrundet, welches Bild zu welchem Volk gehört — all das rechnet
-- das Gerät (tool.js, Abschnitt „DU SELBST"). Am Server steht genau
-- EINE Zahl:
--
--   wi_solo_learners.settings.faction   0…7, Nummer aus TEAMS
--
-- Sie muss dorthin, weil sie das Einzige an der Figur ist, das nicht
-- aus der Insel folgt: der Startwert bestimmt die Insel, die Wörter
-- bestimmen die Tiere — das Volk bestimmt niemand außer dem Kind.
-- Ein Kind, das sich an einem anderen Tablet anmeldet, soll sich
-- selbst wiederfinden und nicht wieder eine Brokkoli-Giraffe sein.
--
-- ── Warum eine eigene Funktion und nicht wi_solo_settings ─────
-- Zwei Gründe, und der zweite ist der wichtigere:
--
--   1) Die Signatur. wi_solo_settings(text, uuid[], text, text) um
--      einen Parameter zu erweitern hieße, eine ZWEITE Funktion
--      gleichen Namens anzulegen — alle Alt-Aufrufe mit vier
--      Argumenten wären danach mehrdeutig („function is not
--      unique"). Der Ausweg wäre ein `drop function`, und den gibt
--      es hier nicht (Regel: feedback_supabase_no_drop_statements).
--
--   2) wi_solo_settings wirft die laufende Aufgabe weg und setzt den
--      Rundenbalken zurück. Das ist dort richtig: wer die Units
--      wechselt, übt ab jetzt etwas anderes. Für die Farbe der
--      eigenen Jacke wäre es falsch — das Volk zu wechseln, während
--      eine Vokabel auf dem Schirm steht, darf diese Vokabel nicht
--      kosten. Zusammengelegt hätte die Funktion zwei
--      Änderungsgründe und eine Nebenwirkung, die niemand erwartet.
--
-- ── Der Deckel 0…7 ───────────────────────────────────────────
-- Acht Völker (seit 0135). Die Zahl steht hier als Prüfung und in
-- tool.js als TEAMS.length — wer ein neuntes Volk einhängt, muss
-- BEIDE anfassen. Eine Prüfung gegen eine Tabelle gäbe es nicht:
-- die Völker sind kein Datenbankinhalt, sie stehen im Werkzeug.
--
-- Abgelehnt wird mit 'invalid_input' und nicht still begradigt: eine
-- Nummer, die das Gerät gar nicht kennt, ist ein Fehler im Gerät,
-- und der soll auffallen.
--
-- ── Ohne diese Migration ─────────────────────────────────────
-- Das Werkzeug funktioniert trotzdem: die Wahl gilt sofort und
-- bleibt im localStorage des Geräts. Es SAGT dann aber auch, dass
-- sie nur dort liegt („Dein Volk merkt sich gerade nur dieses
-- Gerät") — „gemerkt" und „nur hier gemerkt" dürfen nie gleich
-- aussehen (Regel: feedback_missing_migration_looks_like_network).
--
-- Kein DROP, keine neue Spalte, keine neue Tabelle.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- wi_solo_avatar — das eigene Volk setzen
-- ───────────────────────────────────────────────────────────────
create or replace function wi_solo_avatar(
  p_token   text,
  p_faction int
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l   wi_solo_learners;
  v_new jsonb;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Acht Völker (0135). Siehe den Kopf: dieser Deckel und
  -- TEAMS.length in tool.js gehören zusammen.
  if p_faction is null or p_faction < 0 or p_faction > 7 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_new := v_l.settings || jsonb_build_object('faction', p_faction);

  -- Nur die eine Zahl und der Zeitstempel. KEIN current_item, kein
  -- pass_done: das Volk zu wechseln ist keine Änderung am Üben.
  update wi_solo_learners
     set settings     = v_new,
         last_seen_at = now()
   where id = v_l.id;

  return jsonb_build_object('ok', true, 'settings', v_new);
end;
$$;

revoke all on function wi_solo_avatar(text, int) from public;
grant execute on function wi_solo_avatar(text, int) to anon, authenticated;

comment on function wi_solo_avatar(text, int) is
  'Das eigene Volk auf der Insel (settings.faction, 0…7 nach TEAMS in tool.js). '
  'Figur und Schiff hängen daran. Fasst bewusst nichts am Üben an — anders als '
  'wi_solo_settings, das die laufende Aufgabe und den Rundenbalken zurücksetzt.';
