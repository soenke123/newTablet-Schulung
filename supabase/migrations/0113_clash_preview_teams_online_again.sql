-- ═══════════════════════════════════════════════════════════════
-- Kingdoms of Mathoria: Karteileichen wieder aus den Teams halten
-- ═══════════════════════════════════════════════════════════════
-- 0094 hatte clash_preview_teams auf „online" umgestellt: nur wer in
-- den letzten 90 Sekunden gepollt hat, steht in einem Volk und bekommt
-- beim Start ein Team. 0104 (Schuffel-Knopf) hat die Funktion neu
-- deklariert — und dabei versehentlich 0093 als Vorlage genommen statt
-- 0094. Die Zeile
--
--     and p.last_seen_at > now() - interval '90 seconds'
--
-- ist damit weggefallen. Bitter: 0104 zitiert die Projektregel
-- („nie aus einer alten Migration kopieren") im eigenen Kommentar —
-- für clash_sig_of hat sie gegriffen, für clash_preview_teams nicht.
--
-- ── Was seitdem im Unterricht passiert ist ─────────────────────
-- Die Funktion ist die EINE Formel hinter drei Dingen, also war auch
-- alles dreifach falsch:
--
--   · Die Volk-Spalten der Lobby zeigten jeden, der dem Raum je
--     beigetreten ist — geschlossener Browser eingeschlossen.
--   · `offline_members` ist als KOMPLEMENT zu dieser Funktion
--     definiert (0097). Steht jeder drin, ist das Komplement leer:
--     die Reihe „Gerade nicht online (n)" unter den Völkern war
--     seitdem nie wieder zu sehen. Sie fehlte nicht — sie war leer.
--   · clash_room_start liest dieselbe Funktion und hat die
--     Karteileichen mitverteilt. Die Teams waren der Zahl nach
--     gleich groß und in Wirklichkeit ungleich besetzt, und genau
--     das ist der Grund, aus dem es hier um Balance geht.
--
-- ── Neu: stillgelegte Geräte fallen sofort raus ────────────────
-- `blocked` (0081) wirkte bisher nur mittelbar: skill_sig/skill_view
-- steigen bei einem gesperrten Gerät VOR dem last_seen_at-Update aus,
-- also läuft dessen Online-Fenster nach dem Stilllegen von selbst ab.
-- Das stimmt, dauert aber bis zu 90 Sekunden — und wer in der Lobby
-- jemanden stilllegt, will ihn nicht anderthalb Minuten später aus der
-- Spalte rutschen sehen. Die Bedingung steht deshalb ausdrücklich hier.
--
-- ── Was der Fix NICHT kann ─────────────────────────────────────
-- last_seen_at misst „Seite offen und im Vordergrund", nicht „Mensch
-- davor". Zugeklapptes Tablet, App gewechselt, Tab gewechselt, Browser
-- zu: alles erkannt, der Poller ruht bei document.hidden. Ein
-- aufgeschlagen liegengelassenes Tablet pollt dagegen weiter und bleibt
-- online. Dafür gibt es serverseitig kein Signal; das bliebe ein
-- Handgriff der Lehrkraft (Teilnehmer entfernen) und ist bewusst nicht
-- Teil dieser Migration.
--
-- Reine Funktionsänderung: kein neues Feld, keine Client-Anpassung.
-- clash_sig_of (zuletzt 0109) zählt `count(*) from clash_preview_teams`
-- mit — fällt jemand aus dem Fenster, ändert sich die Signatur und die
-- Lobby zeichnet beim nächsten Poll von selbst neu.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- clash_preview_teams — 0104 plus die verlorene Online-Grenze
-- ─────────────────────────────────────────────────────────────
-- Basis ist ausdrücklich 0104 (shuffle_seed!), nicht 0094 — sonst
-- verlöre der Schuffel-Knopf seine Wirkung und wir hätten denselben
-- Fehler nur in die andere Richtung wiederholt.
--
-- Die 90 Sekunden sind dieselbe Schwelle wie in skill_people_json
-- (0079) und die Begründung von dort gilt unverändert: gepollt wird
-- alle paar Sekunden, last_seen_at wird höchstens jede Minute
-- nachgeführt (Drosselung) — 90 s übersteht beides sicher, ohne ein
-- zugeklapptes Tablet minutenlang als anwesend zu führen.
--
-- Gefiltert wird VOR dem dense_rank: die Reihenfolge entsteht damit
-- nur unter den Anwesenden, und drei fehlende Kinder reißen keine
-- Lücke in die Verteilung.
create or replace function clash_preview_teams(p_room uuid)
  returns table(participant_id uuid, team_index int)
  security definer
  set search_path = public
  language sql
  stable
as $$
  select p.id,
         ((dense_rank() over (
            order by
              case when b.shuffle_seed is null then p.seat end,
              case when b.shuffle_seed is not null
                   then md5(p.id::text || b.shuffle_seed::text) end
          ))::int - 1) % b.team_count
    from skill_participants p
    join clash_boards b on b.room_id = p.room_id
   where p.room_id = p_room
     and p.last_seen_at > now() - interval '90 seconds'
     and not p.blocked;
$$;

revoke all on function clash_preview_teams(uuid) from public;

comment on function clash_preview_teams(uuid) is
  'Team-Index je ANWESENDEM Teilnehmer (last_seen_at < 90s wie 0079, und nicht blocked) nach '
  'Sitzplatz-Reihenfolge — oder, sobald shuffle_seed gesetzt ist (0104), nach einer daraus '
  'gehashten Zufallsreihenfolge. Wer nicht anwesend ist, taucht hier nicht auf, steht dadurch '
  'in offline_members (Komplement, 0097) und bekommt beim Start kein Team. Vor dem Start eine '
  'reine Vorschau, beim Start die Quelle für die endgültige clash_players-Zuordnung. '
  'Die Online-Grenze stammt aus 0094, ging in 0104 verloren und ist seit 0113 zurück.';
