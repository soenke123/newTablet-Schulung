-- ══════════════════════════════════════════════════════════════
-- Migration 0207 — Knowledge Stack: 40 statt 36 Wesen
-- ══════════════════════════════════════════════════════════════
-- creatures.js hat vier neue Wesen (36 Prisma · Einhorn, 37 Plato ·
-- Schnabeltier, 38 Krümel · Ratte, 39 Howl · Werwolf). Die Datenbank
-- kannte bisher nur die Nummern 0…35:
--
--   · ks_players.creature_id   check (creature_id between 0 and 35)
--   · ks_join                  klemmt p_creature auf 0…35 — wer eines
--                              der neuen Wesen wählte, stand danach
--                              stumm als Spindle (35) in der Lobby
--
-- Beides geht jetzt bis 39.
--
-- ⚠️ Das `drop constraint` unten ist KEINE Idempotenz-Krücke (dafür
-- gilt weiter: DO-Block + pg_catalog-Check, siehe
-- feedback_supabase_no_drop_statements) — es IST der Umbau: eine
-- Prüfregel lässt sich in Postgres nicht ändern, nur ersetzen. Es geht
-- kein Datensatz verloren; die neue Regel ist die alte mit einer
-- größeren Zahl und lässt jede bestehende Zeile durch. Dasselbe Muster
-- wie in 0108 und 0135.
--
-- Sonst kein DROP — ks_join per `create or replace`. Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) creature_id darf bis 39
-- ─────────────────────────────────────────────────────────────
-- Der Check heißt so, wie Postgres ihn beim `check (…)` in der
-- Spaltendefinition von 0174 getauft hat. Entschieden wird an der
-- DEFINITION: ein zweiter Lauf findet „39" und tut nichts mehr.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_catalog.pg_constraint c
   where c.conname  = 'ks_players_creature_id_check'
     and c.conrelid = 'public.ks_players'::regclass;

  if v_def is not null and position('39' in v_def) = 0 then
    alter table ks_players drop constraint ks_players_creature_id_check;
    v_def := null;
  end if;

  if v_def is null then
    alter table ks_players
      add constraint ks_players_creature_id_check
      check (creature_id between 0 and 39);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 2) ks_join — wortgleich zu 0175, nur 35 → 39
-- ─────────────────────────────────────────────────────────────
create or replace function ks_join(
  p_token    text,
  p_nickname text     default null,
  p_creature smallint default 0,
  p_skin     smallint default 0
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p  skill_participants;
  v_b  ks_boards;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_token'); end if;
  if v_p.blocked then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;

  v_b := ks_ensure_board(v_p.room_id);
  perform ks_ensure_player(v_p.id, v_p.room_id);

  if v_b.phase = 'question' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  update ks_players
     set nickname    = coalesce(nullif(btrim(p_nickname), ''), nickname, v_p.name, 'Gast'),
         creature_id = least(greatest(coalesce(p_creature, 0::smallint), 0::smallint), 39::smallint),
         skin_idx    = least(greatest(coalesce(p_skin, 0::smallint), 0::smallint), 2::smallint)
   where participant_id = v_p.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_join(text, text, smallint, smallint) from public;
grant execute on function ks_join(text, text, smallint, smallint) to anon, authenticated;
