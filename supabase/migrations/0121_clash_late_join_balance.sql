-- ═══════════════════════════════════════════════════════════════
-- 0121 · Kingdoms of Mathoria — Nachzügler ins KLEINSTE Volk
-- ═══════════════════════════════════════════════════════════════
--
-- „Wenn User in ein laufendes Spiel joinen, werden sie einfach einem
--  Team hinzugefügt, ohne darauf zu achten, welches Team am wenigsten
--  Spieler hat." — genau so ist es, und das steht in EINER Zeile:
--
--     select owner_team into v_team
--       from clash_tiles where room_id = p_room
--      group by owner_team order by random() limit 1;
--
-- Beim START ist die Verteilung sauber (clash_preview_teams verteilt
-- reihum, `(dense_rank()-1) % team_count`, seit 0113 wieder nur unter
-- den Anwesenden). Danach war sie dem Zufall überlassen: bei vier
-- Völkern hat jeder Nachzügler eine 1:4-Chance je Volk, und bei acht
-- Nachzüglern in einer Doppelstunde ist eine 5:1:1:1-Verteilung nicht
-- unwahrscheinlich, sondern der Normalfall. In einem Spiel, in dem
-- Tempo = Antworten pro Minute = Eroberungen ist, entscheidet das die
-- Partie, bevor jemand rechnet.
--
-- ── Neu: das kleinste lebende Volk gewinnt den Nachzügler ──────
-- Statt `order by random()` jetzt `order by (Kopfzahl), random()`.
-- Der Zufall bleibt — aber nur noch als Losentscheid unter den
-- GLEICH kleinen Völkern. Damit füllt sich reihum auf, wie es die
-- Startformel auch täte: 3/3/2/2 → der nächste kommt zu einem der
-- beiden Zweier, der übernächste zum anderen, dann 3/3/3/3.
--
-- ── Gezählt wird, wer wirklich da ist ──────────────────────────
-- Zwei Kopfzahlen hintereinander, nicht eine:
--
--   1. `active_n` — Zeilen in clash_players, deren Teilnehmer nicht
--      gegangen ist (left_at is null, 0088), nicht stillgelegt ist
--      (blocked, 0081) und in den letzten 90 Sekunden gepollt hat.
--      Die 90 s sind dieselbe Schwelle wie in skill_people_json (0079)
--      und clash_preview_teams (0113) — die Begründung von dort gilt
--      unverändert.
--   2. `total_n` — alle zugeordneten Zeilen, als Gleichstands-Brecher.
--      Zwei Völker mit je zwei aktiven Spielern sind nicht gleich, wenn
--      eines davon noch drei zugeklappte Tablets führt: die kommen
--      wahrscheinlich zurück (Pause, App gewechselt), also geht der
--      Nachzügler in das Volk, das auch nachher noch das kleinere ist.
--
-- Warum nicht nach GEBIET (Kachelzahl) balanciert wird: das wäre eine
-- andere Entscheidung — „wer schlecht steht, kriegt Verstärkung" ist
-- eine Handicap-Regel und keine Team-Größe. Gefragt war die Waage der
-- Mannschaftsstärken, und nur die ändert sich hier. Ein Volk, das
-- gerade Boden verliert, soll das durch Rechnen wieder aufholen.
--
-- ── Nebenbei behoben: das neutrale „Volk" -1 ───────────────────
-- Seit 0105 gibt es neutrale Kacheln mit owner_team = -1 (die Löcher,
-- die die gleich großen Vielecke am Rand übrig lassen). `group by
-- owner_team` über clash_tiles hat sie als achtes Volk mitgeführt —
-- ein Nachzügler konnte also den Neutralen zugelost werden. Sichtbar
-- wurde das kaum, denn dieses „Volk" hat keine Burg und keine Farbe,
-- aber der Spieler hätte für niemanden gespielt und wäre in keiner
-- Team-Ansicht aufgetaucht. `owner_team >= 0` schließt das aus —
-- dieselbe Grenze, die clash_submit_answer bei der Sieg-Prüfung und
-- der Sieger-Auswahl schon seit 0105 zieht.
--
-- ── Was NICHT angefasst wird ───────────────────────────────────
-- Der frühe Ausstieg `if exists (select 1 from clash_players …)`
-- bleibt Wort für Wort stehen. Er ist der Wiedererkennungs-Mechanismus
-- für kurze Aussetzer: wer schon eine Zeile hat, behält sein Volk,
-- seine Serie und seine Zähler. Würde die Balance auch für ihn greifen,
-- wechselte ein Kind bei jedem Funkloch die Fahne.
--
-- ⚠️ Grundlage ist ausdrücklich 0110 (current_q + Pool des Raums),
-- die HÖCHSTE bestehende Fassung dieser Funktion
-- (Regel: feedback_shop_state_merge_regressions).
--
-- Reine Funktionsänderung: kein neues Feld, keine Client-Anpassung,
-- kein Cache-Stempel nötig.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- clash_ensure_player — 0110 plus Balance und die -1-Grenze
-- ─────────────────────────────────────────────────────────────
create or replace function clash_ensure_player(p_participant uuid, p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_phase text;
  v_pool  jsonb;
  v_team  int;
begin
  if exists (select 1 from clash_players where participant_id = p_participant) then
    return;
  end if;

  select phase, pool into v_phase, v_pool from clash_boards where room_id = p_room;
  if v_phase is null or v_phase = 'lobby' then
    return;
  end if;

  -- Kandidaten sind die Völker, die noch Kacheln besitzen (kein
  -- eliminated-Flag, siehe Kopfkommentar von 0093) — neutrale Felder
  -- ausgenommen. Je Kandidat einmal die Kopfzahl; die Reihenfolge
  -- entscheidet, der Zufall nur noch bei Gleichstand.
  select cand.team into v_team
    from (
      select distinct owner_team as team
        from clash_tiles
       where room_id = p_room
         and owner_team >= 0
    ) cand
    cross join lateral (
      select
        count(*) filter (
          where sp.left_at is null
            and not sp.blocked
            and sp.last_seen_at > now() - interval '90 seconds'
        )::int as active_n,
        count(*)::int as total_n
        from clash_players cp
        join skill_participants sp on sp.id = cp.participant_id
       where sp.room_id  = p_room
         and cp.team_index = cand.team
    ) n
   order by n.active_n, n.total_n, random()
   limit 1;

  if v_team is null then
    return;
  end if;

  insert into clash_players (participant_id, team_index, current_q)
  values (p_participant, v_team, clash_new_question(v_pool))
  on conflict (participant_id) do nothing;
end;
$$;

revoke all on function clash_ensure_player(uuid, uuid) from public;

comment on function clash_ensure_player(uuid, uuid) is
  'Legt eine clash_players-Zeile nur an, wenn noch keine existiert (das ist der Wiedererkennungs-'
  'Mechanismus für kurze Aussetzer). Neuzugänge während countdown/running kommen seit 0121 in das '
  'KLEINSTE noch lebende Volk — gezählt werden anwesende Spieler (left_at is null, nicht blocked, '
  '90 s wie 0079), bei Gleichstand entscheidet die Gesamtzahl der Zugeordneten, erst danach der '
  'Zufall. Neutrale Kacheln (owner_team = -1, 0105) sind kein Volk und kommen nicht in Frage. '
  'NICHT die Sitzplatz-Formel — die gilt nur für den Start. Aufgabe aus dem Pool des Raums (0110).';
