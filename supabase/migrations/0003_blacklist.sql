-- ══════════════════════════════════════════════════════════════
-- Migration 0003 — Schimpfwort-Blacklist
-- ══════════════════════════════════════════════════════════════
-- Wortliste liegt in einer Tabelle (statt Konstante in Function),
-- damit Admins die Liste per SQL pflegen können, ohne dass die
-- Function neu deployt werden muss.
--
-- Sync mit supabase/blacklist_de.txt: die .txt-Datei ist die
-- Referenz zum Lesen/Planen. Änderungen müssen aber HIER (per
-- INSERT/DELETE) in die DB. Für Admin-Panel-Zukunft: Wortliste
-- wird dort direkt aus dieser Tabelle bearbeitet.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- Tabelle (idempotent)
-- ─────────────────────────────────────────────────────────────
create table if not exists blacklist_words (
  word       text primary key check (lower(word) = word and length(word) >= 2),
  created_at timestamptz not null default now()
);

alter table blacklist_words enable row level security;

-- Kein GRANT für anon/authenticated. Nur die Function darf lesen
-- (via SECURITY DEFINER) und Admins via service_role.


-- ─────────────────────────────────────────────────────────────
-- Prüf-Function
-- ─────────────────────────────────────────────────────────────
-- Normalisierungsstufen:
--   1. lowercase
--   2. Umlaute + ß transliterieren (ä→ae, ö→oe, ü→ue, ß→ss)
--   3. Leet-Speak-Ersetzung ($→s, @→a, 3→e, 0→o, 1→i, 4→a, 5→s, 7→t)
--   4. alles außer a-z / 0-9 entfernen
-- Dann Substring-Vergleich gegen blacklist_words.
--
-- Beispiele:
--   'SchEiß3'    → 'scheisse'   → true (matched 'scheisse')
--   'mA$$imus'   → 'massimus'   → true (matched 'ass')
--   'Klassenraum'→ 'klassenraum'→ true (matched 'ass', bewusst konservativ)
--   'SuperMax42' → 'supermaxaa' → false
create or replace function contains_blacklisted_word(input text)
  returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select exists (
    select 1
    from blacklist_words w
    where
      regexp_replace(
        translate(
          replace(replace(replace(replace(lower(input),
            'ä', 'ae'),
            'ö', 'oe'),
            'ü', 'ue'),
            'ß', 'ss'),
          '$@013457',
          'saoieast'
        ),
        '[^a-z0-9]', '', 'g'
      ) like '%' || w.word || '%'
  );
$$;

revoke all on function contains_blacklisted_word(text) from public;
grant execute on function contains_blacklisted_word(text) to anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────
-- Seed — synchron mit supabase/blacklist_de.txt
-- ─────────────────────────────────────────────────────────────
insert into blacklist_words (word) values
  -- Deutsch: Beleidigung / vulgär
  ('arsch'), ('arschloch'), ('bastard'),
  ('fick'), ('ficken'), ('fotze'),
  ('hure'), ('kacke'), ('kanake'),
  ('missgeburt'), ('mistkerl'), ('muschi'),
  ('nutte'), ('pimmel'), ('pisse'),
  ('scheisse'), ('schlampe'), ('schwanz'),
  ('schwuchtel'), ('spast'), ('spasti'),
  ('verpisst'), ('wichser'), ('wixer'),
  -- Deutsch: rassistisch / diskriminierend
  ('neger'), ('nigger'),
  -- Deutsch: sexuell
  ('porno'), ('sex'),
  -- Englisch: Standard-Blacklist
  ('anal'), ('anus'), ('ass'), ('asshole'),
  ('bitch'), ('boobs'),
  ('cock'), ('cum'), ('cunt'),
  ('dick'), ('dildo'),
  ('faggot'), ('fuck'), ('motherfucker'),
  ('nazi'), ('penis'), ('piss'), ('pussy'),
  ('retard'), ('shit'), ('slut'),
  ('tits'), ('twat'),
  ('vagina'), ('whore'),
  -- Politisch/extremistisch
  ('hitler'), ('hakenkreuz'), ('heil')
on conflict (word) do nothing;

-- Hinweis: durch die Umlaut-Transliteration wird 'scheiße' zu
-- 'scheisse' — deshalb reicht 'scheisse' in der Blacklist.
