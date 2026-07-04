-- ══════════════════════════════════════════════════════════════
-- Migration 0001 — Init-Schema für Lernwelt
-- ══════════════════════════════════════════════════════════════
-- Legt alle Tabellen aus Kapitel 5 des PROJEKTBRIEFING.md an.
-- KEINE RLS-Policies und KEINE RPCs in dieser Migration — die
-- kommen in 0002 (Arbeitsschritt 2).
--
-- Ausführen: SQL-Editor im Supabase-Dashboard → Inhalt einfügen → Run
-- ══════════════════════════════════════════════════════════════

-- Für gen_random_uuid()
create extension if not exists pgcrypto;


-- ─────────────────────────────────────────────────────────────
-- schools
-- ─────────────────────────────────────────────────────────────
create table schools (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text unique not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table  schools      is 'Mandanten. Aktuell nur MPS, multi-tenant-ready.';
comment on column schools.slug is 'Kurzform für Fake-Mail-Domain, z.B. "mps" → max@mps.tablet-schulung.fake';


-- ─────────────────────────────────────────────────────────────
-- clusters
-- ─────────────────────────────────────────────────────────────
create table clusters (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete restrict,
  name        text not null,
  season      int  not null default 1 check (season >= 1),
  opens_at    timestamptz,
  closes_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (school_id, name),
  check (opens_at is null or closes_at is null or opens_at < closes_at)
);

create index clusters_school_id_idx on clusters(school_id);
create index clusters_window_idx    on clusters(opens_at, closes_at);

comment on table clusters is 'Schulungs-Kohorte. Ein Schüler ist in genau einem Cluster (oder in keinem = pending).';


-- ─────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────
create table profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  school_id            uuid not null references schools(id)  on delete restrict,
  cluster_id           uuid references clusters(id)          on delete set null,
  account_name         text not null,
  display_name         text not null,
  display_name_locked  boolean not null default false,
  status               text not null default 'pending' check (status in ('pending','active')),
  is_admin             boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (school_id, account_name)
);

create index profiles_cluster_id_idx on profiles(cluster_id);
create index profiles_status_idx     on profiles(status);

comment on column profiles.account_name is 'Login-Identifier, lowercase-normalisiert, pro Schule unique.';
comment on column profiles.display_name is 'Öffentlich sichtbarer Name für Highscores/Gallery. Änderbar solange display_name_locked=false.';
comment on column profiles.is_admin     is 'Trennung von Schüler-Fake-Mail-Accounts und echten Admin-Accounts.';


-- ─────────────────────────────────────────────────────────────
-- games — Metadaten der Spiele (spiegelt GAMES_CONFIG)
-- ─────────────────────────────────────────────────────────────
create table games (
  id              text primary key,
  season          int  not null check (season >= 1),
  folder          text not null,
  title           text,
  icon            text,
  password_hash   text,
  requires_login  boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index games_season_idx on games(season);

comment on column games.password_hash  is 'SHA-256-Hash des Freischalt-Passworts. NULL = kein Passwort.';
comment on column games.requires_login is 'true = Spiel ist nur eingeloggt spielbar (Easter-Eggs wie 1337.html).';


-- ─────────────────────────────────────────────────────────────
-- user_unlocked_games — welcher User hat welches Passwort-Spiel entsperrt
-- ─────────────────────────────────────────────────────────────
create table user_unlocked_games (
  user_id      uuid not null references auth.users(id) on delete cascade,
  game_id      text not null references games(id)      on delete cascade,
  unlocked_at  timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index user_unlocked_games_user_idx on user_unlocked_games(user_id);


-- ─────────────────────────────────────────────────────────────
-- game_state — Punkte, Kreatur, Wachstum pro (User, Spiel)
-- ─────────────────────────────────────────────────────────────
create table game_state (
  user_id        uuid not null references auth.users(id) on delete cascade,
  game_id        text not null references games(id)      on delete cascade,
  points         int  not null default 0 check (points >= 0),
  rounds_played  int  not null default 0 check (rounds_played >= 0),
  creature       text,
  growth         int  not null default 0 check (growth >= 0),
  updated_at     timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index game_state_user_idx on game_state(user_id);


-- ─────────────────────────────────────────────────────────────
-- wallets — Coins pro User
-- ─────────────────────────────────────────────────────────────
create table wallets (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  coins       int  not null default 0 check (coins >= 0),
  updated_at  timestamptz not null default now()
);


-- ─────────────────────────────────────────────────────────────
-- user_collectibles — Rare/Epic/Legendary, extra Slots, Shop-Käufe
-- ─────────────────────────────────────────────────────────────
create table user_collectibles (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  value       jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

comment on column user_collectibles.key is 'Beispiel: "rare_drache", "extra_slot_1", "codex_bought", "seen_creatures".';


-- ─────────────────────────────────────────────────────────────
-- migration_pending — Alte-Version-Progress-Übernahme (Kap. 8)
-- ─────────────────────────────────────────────────────────────
create table migration_pending (
  token       text primary key,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  consumed_at timestamptz
);

create index migration_pending_created_idx on migration_pending(created_at);

comment on table migration_pending is 'Temporäre Ablage für localStorage-Payloads aus alter Version. Token läuft nach kurzer Zeit ab.';


-- ─────────────────────────────────────────────────────────────
-- View: user_session — effektive Session eines Users inkl. Season
-- ─────────────────────────────────────────────────────────────
create view user_session as
select
  p.id,
  p.school_id,
  p.cluster_id,
  p.account_name,
  p.display_name,
  p.status,
  p.is_admin,
  coalesce(c.season, 0) as season
from profiles p
left join clusters c on c.id = p.cluster_id;

comment on view user_session is
  'Effektive Session: season=0 wenn kein Cluster, sonst Cluster-Season. Frontend fragt hiervon getUserSeason() ab.';
