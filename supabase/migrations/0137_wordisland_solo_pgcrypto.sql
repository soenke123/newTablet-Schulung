-- ══════════════════════════════════════════════════════════════
-- Migration 0137 — Myth of Wordisland: pgcrypto liegt nicht in public
-- ══════════════════════════════════════════════════════════════
-- Nachbesserung zu 0136. Sönke, 2026-09-10, aus der Konsole:
--
--   wi_solo_claim 404: {"code":"42883",
--     "message":"function gen_random_bytes(integer) does not exist"}
--
-- In Supabase ist pgcrypto NICHT in `public` installiert, sondern in
-- `extensions`. Eine Funktion mit `set search_path = public` sieht
-- die Erweiterung deshalb nicht — auch nicht als security definer.
-- Der gesamte MPSkills-Bestand weiß das längst: skill_room_join
-- schreibt seit 0081 `set search_path = public, extensions`, und aus
-- demselben Grund. In 0136 ist genau diese eine Funktion durchs Netz
-- gefallen.
--
-- Die Wirkung war maximal unauffällig: `create function` prüft den
-- PL/pgSQL-Rumpf nicht auf auflösbare Aufrufe, also lief 0136 sauber
-- durch. Der Fehler kam erst beim ersten Kind, das einem Raum
-- beitrat — und das ist der Moment, in dem er am teuersten ist.
-- Der Prüfstand hat ihn nicht gefangen, weil sein Stub
-- gen_random_bytes in `public` anlegte. Das ist mit dieser Runde
-- korrigiert (supabase/tests/0136_wordisland_solo.mjs).
--
-- ── Warum eine neue Datei und kein Nachtippen in 0136 ──────────
-- 0136 lag zu diesem Zeitpunkt schon in der Datenbank. Eine
-- Korrektur IN einer bereits gelaufenen Migration kommt dort nie an
-- (Regel: „Stale Referenzdaten bei do nothing"). Also bekommt
-- wi_solo_create hier ihre jüngste und ab jetzt maßgebliche Fassung.
-- Wer sie später ändert, ändert DIESE — nicht die in 0136.
--
-- ── Zweite Sache, beim Nachsehen der Rechte gefunden ───────────
-- 0136 vergibt für seine sechs Client-Funktionen sauber
-- `revoke all … from public`, für die beiden INTERNEN aber nicht.
-- Ohne Zeile gilt der Postgres-Standard „execute to public", und
-- PostgREST stellt jede Funktion im Schema public als Endpunkt
-- bereit. Damit stand
--
--   wi_solo_create()          jedem offen → beliebig viele leere
--                             Insel-Zeilen anlegbar (Müll, kein
--                             Zugriff auf fremde Daten)
--   wi_solo_resolve(text)     als security definer offen → gibt zu
--                             einem Token die Zeile heraus. Wer den
--                             Token hat, hat ohnehin die Insel; die
--                             Tür ist trotzdem unnötig.
--
-- Die übrigen Helfer (stages, chosen, due, pick_next, next,
-- task_json, record) sind KEINE definer und laufen als anon gegen
-- RLS ohne Policy — die laufen ins Leere und bleiben, wie sie sind.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wi_solo_create — dieselbe Funktion, ein Schema mehr im Pfad
-- ─────────────────────────────────────────────────────────────
-- Anlegen. Getrennt von resolve, weil das Ansehen einer Insel
-- keine anlegen darf: sonst sammelte jeder Aufruf der Landing eine
-- leere Zeile an, und die Kachel „Meine Insel" erschiene für alle,
-- auch für die, die nie in einem Raum waren.
--
-- Der Rumpf ist Wort für Wort der aus 0136 §5. Geändert ist
-- ausschließlich die search_path-Zeile.
create or replace function wi_solo_create()
  returns wi_solo_learners
  volatile
  security definer
  set search_path = public, extensions   -- ⚠️ pgcrypto, siehe Kopf
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
-- 2) Die beiden internen Türen zumachen
-- ─────────────────────────────────────────────────────────────
-- Kein `grant … to anon` dahinter, und das ist der Punkt: beide
-- werden ausschließlich aus wi_solo_claim heraus gerufen, und die
-- läuft als security definer mit den Rechten ihres Eigentümers.
-- Der Entzug trifft also nur den Weg von außen.
revoke all on function wi_solo_create() from public;
revoke all on function wi_solo_resolve(text) from public;
