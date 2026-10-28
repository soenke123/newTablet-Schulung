-- ══════════════════════════════════════════════════════════════
-- Migration 0236 — Definitions Derby: Insel-Wesen als Profilbilder
-- ══════════════════════════════════════════════════════════════
-- Sönke 28.10.2026: „alle Monster sollen auch als Avatarbilder
-- verfügbar sein. Man bekommt sie, sobald man das jeweilige Monster
-- freigeschaltet hat. Jedes Monster ist ein Profilbild.“
--
-- Baut auf 0214 (mps_avatar_unlocks, mps_my_avatars) und 0234
-- (dd_progress) auf. Ids wie in avatars.js (MPS_CATALOG.mps_derby):
-- 'mps_derby_' || Form, Form wie die Dateien in
-- MPSkills/tools/DefinitionsDerby/wesen/ (baby, k_a, k_b, m_a_a … m_b_c,
-- g_a_a_a … g_b_c, f_a_a_a … f_b_c) — 26 Porträts von Sönke in
-- „avatare MPSkills/Definitions Derby/“. Eier sind kein Profilbild.
--
-- Regel: dd_progress.data hält je Karte die Insel-Stufe e (0 Ei …
-- 5 Leuchtend). Welche Form ein Wesen auf jeder Stufe hat, würfelt
-- tool.js aus der Karten-id (wesenAst: FNV-1a-Hash von
-- 'wesen:<stapel>:<karte>' → mulberry32). dd_wesen_files rechnet das
-- hier Bit für Bit nach. Erreicht ein Wesen Stufe e ≥ 1, gehören alle
-- Formen seines Asts von Baby bis e der Person (wer groß ist, war
-- vorher auch klein). Das Ei (Index 1) wird übersprungen.
--
-- Trigger auf dd_progress (geschrieben von dd_prog_put/dd_mprog_put,
-- also nur mit Konto); beim UPDATE nur Karten, deren e sich geändert
-- hat. Einmal nachgetragen für alles, was schon da ist.
--
-- Prüfstand: supabase/tests/0236_definitionsderby_avatare.mjs (rechnet
-- wesenAst aus tool.js in JS gegen dd_wesen_files).
-- Kein DROP außer `drop trigger if exists`. Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════


-- Math.imul für 32 Bit, ohne Vorzeichen (0 … 2^32-1). Aufgeteilt in
-- 16-Bit-Hälften, damit nichts über bigint hinausläuft.
create or replace function dd_imul(a bigint, b bigint)
  returns bigint
  language sql
  immutable
  parallel safe
  set search_path = public
as $$
  select ((a * (b & 65535)) + (((a * (b >> 16)) & 65535) << 16)) & 4294967295
$$;

revoke all on function dd_imul(bigint, bigint) from public;


-- Formen eines Wesens je Stufe 0…5 (Index 1…6), wie wesenAst/wesenFile
-- in tools/DefinitionsDerby/tool.js. p_id = '<stapel-id>:<karten-id>'.
create or replace function dd_wesen_files(p_id text)
  returns text[]
  language plpgsql
  immutable
  parallel safe
  set search_path = public
as $$
declare
  h bigint := 2166136261;          -- FNV-1a über 'wesen:' || p_id
  s bigint;
  t bigint;
  r float8[] := '{}';
  v_in text := 'wesen:' || p_id;
  i int;
  v_egg int;
  v_k text;
  v_m text;
  v_g text;
begin
  for i in 1 .. length(v_in) loop
    h := h # ascii(substr(v_in, i, 1));
    h := dd_imul(h, 16777619);
  end loop;
  -- mulberry32, vier Würfe
  s := h;
  for i in 1 .. 4 loop
    s := (s + 1831565813) & 4294967295;          -- 0x6D2B79F5
    t := s;
    t := dd_imul(t # (t >> 15), t | 1);
    t := t # ((t + dd_imul(t # (t >> 7), t | 61)) & 4294967295);
    r := r || (((t # (t >> 14)) & 4294967295)::float8 / 4294967296);
  end loop;
  v_egg := case when r[1] < 0.5 then 1 else 2 end;
  v_k   := case when r[2] < 0.5 then 'a' else 'b' end;
  v_m   := v_k || '_' || case when v_k = 'a' then (case when r[3] < 0.5 then 'a' else 'b' end)
                             else (array['a', 'b', 'c'])[floor(r[3] * 3)::int + 1] end;
  v_g   := case when v_m = 'b_c' then v_m else v_m || '_' || (case when r[4] < 0.5 then 'a' else 'b' end) end;
  return array['ei' || v_egg, 'baby', 'k_' || v_k, 'm_' || v_m, 'g_' || v_g, 'f_' || v_g];
end;
$$;

revoke all on function dd_wesen_files(text) from public;


-- Gültige Insel-Stufe einer Karte (ganze Zahl 0…5), sonst null.
create or replace function dd_entry_stage(p_val jsonb)
  returns int
  language sql
  immutable
  parallel safe
  set search_path = public
as $$
  -- verschachtelt, damit der Cast erst nach der Typprüfung läuft
  select case when jsonb_typeof(p_val) = 'object' and jsonb_typeof(p_val -> 'e') = 'number' then
    case when (p_val ->> 'e')::numeric between 0 and 5 and (p_val ->> 'e')::numeric % 1 = 0
         then (p_val ->> 'e')::numeric::int end
  end
$$;

revoke all on function dd_entry_stage(jsonb) from public;


-- Trigger: neue oder geänderte Insel-Stufen → Formen freischalten
create or replace function dd_progress_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  insert into mps_avatar_unlocks (user_id, avatar_id)
  select distinct new.user_id, 'mps_derby_' || (dd_wesen_files(new.stack_id::text || ':' || c.key))[i]
    from (
      select d.key, dd_entry_stage(d.value) as e
        from jsonb_each(new.data) d
       where tg_op = 'INSERT'
          or (old.data -> d.key -> 'e') is distinct from (d.value -> 'e')
    ) c
    cross join lateral generate_series(2, c.e + 1) i      -- ab Baby
   where c.e is not null
  on conflict (user_id, avatar_id) do nothing;
  return new;
end;
$$;

revoke all on function dd_progress_avatars() from public;

drop trigger if exists dd_progress_avatars on dd_progress;
create trigger dd_progress_avatars
  after insert or update of data on dd_progress
  for each row execute function dd_progress_avatars();


-- Einmal nachtragen: was schon gespielt ist
insert into mps_avatar_unlocks (user_id, avatar_id)
select distinct c.user_id, 'mps_derby_' || (dd_wesen_files(c.stack_id::text || ':' || c.key))[i]
  from (
    select p.user_id, p.stack_id, d.key, dd_entry_stage(d.value) as e
      from dd_progress p
      cross join lateral jsonb_each(p.data) d
  ) c
  cross join lateral generate_series(2, c.e + 1) i        -- ab Baby
 where c.e is not null
on conflict (user_id, avatar_id) do nothing;
