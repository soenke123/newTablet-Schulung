-- ══════════════════════════════════════════════════════════════
-- Migration 0061 — user_game_saves: Blob-Spielstände je (User, Spiel)
-- ══════════════════════════════════════════════════════════════
-- Löst den Vorbehalt aus 0060 ab („nur Kachel, noch keine Progress-
-- Integration"). Startup Story (game18) ist eine Simulation, deren
-- kompletter Zustand — Geld, User, Gebäude mit ihren Deal-States,
-- Techtree, Ereigniskarten, gesehene Touren — bisher nur im
-- localStorage lag (startupStoryV3). Damit hing der Fortschritt am
-- Gerät: Tabletwechsel, Schul-PC oder ein Logout auf einem geteilten
-- Gerät kosteten alles.
--
-- Bewusst GENERISCH und nicht game18-spezifisch: die Form „opaker
-- Blob je (User, Spiel)" hat nichts Startup-Story-eigenes. „The
-- Algorithm" und künftige Simulationen können dieselben drei RPCs
-- benutzen, ohne dass eine zweite Tabelle entsteht.
--
-- Abgrenzung zu den beiden vorhandenen Persistenz-Wegen:
--   • game_state (0001)          — feste Spalten, Kreatur/Coins/Growth.
--                                  Bleibt der einzige Weg für alles,
--                                  was der Hub anzeigt oder bewertet.
--   • shop_state (0011)          — jsonb MIT feldweisem Merge, weil
--                                  Shop-Daten additiv über Geräte sind.
--   • user_game_saves (hier)     — jsonb OHNE Merge. Zwei divergierte
--                                  Simulationsstände lassen sich nicht
--                                  sinnvoll verschmelzen; stattdessen
--                                  gewinnt der Server beim Laden und
--                                  `rev` verhindert, dass ein Gerät
--                                  blind über den anderen schreibt.
--
-- ⚠️ Cheat-Härtung ist hier bewusst dünn: der Inhalt ist eine
-- Client-Simulation und serverseitig nicht validierbar. Was prüfbar
-- ist — Auth, Account-Status, Season, Payload-Größe, Schreibtakt —
-- ist drin. Sobald game18 Coins oder eine Kreatur ausschüttet, MUSS
-- das über sync_game_state / submit_game_result laufen und NICHT aus
-- diesem Blob gelesen werden.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) user_game_saves
-- ─────────────────────────────────────────────────────────────
create table if not exists user_game_saves (
  user_id      uuid   not null references auth.users(id) on delete cascade,
  game_id      text   not null references games(id)      on delete cascade,
  save         jsonb  not null,
  save_version int    not null default 1,
  rev          bigint not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index if not exists user_game_saves_user_idx on user_game_saves(user_id);

alter table user_game_saves enable row level security;

do $$
begin
  -- User liest seinen eigenen Spielstand (Boot-Sync).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_game_saves'
       and policyname = 'ugs_select_own'
  ) then
    create policy ugs_select_own on user_game_saves
      for select using (user_id = auth.uid());
  end if;

  -- Admins sehen alles — die Detailansicht im Admin-Panel kommt im
  -- nächsten Schritt und soll dann nichts mehr an der Tabelle brauchen.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_game_saves'
       and policyname = 'ugs_admin_select_all'
  ) then
    create policy ugs_admin_select_all on user_game_saves
      for select using (is_admin());
  end if;
end $$;

-- Kein direktes INSERT/UPDATE für authenticated — nur via RPC.
grant select on user_game_saves to authenticated;
grant select, insert, update, delete on user_game_saves to service_role;

comment on table user_game_saves is
  'Opaker Spielstand-Blob je (User, Spiel) für Simulationsspiele. Kein '
  'Merge: Server gewinnt beim Laden, rev schützt gegen blindes '
  'Überschreiben durch ein zweites Gerät.';
comment on column user_game_saves.save_version is
  'Format-Version des Blobs (Startup Story: RT.storage VERSION). Bei '
  'Abweichung verwirft der Client den Stand, statt ihn zu migrieren.';
comment on column user_game_saves.rev is
  'Schreib-Zähler für Optimistic Concurrency. Der Client schickt die rev, '
  'die er beim Laden gesehen hat; passt sie nicht, wird der Push abgelehnt.';


-- ─────────────────────────────────────────────────────────────
-- 2) load_game_save(p_game_id text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- { ok, save, save_version, rev, updated_at, age_sec }
-- Ohne Zeile: { ok:true, save:null }.
--
-- ⚠️ age_sec ist die Abwesenheit auf der SERVERUHR. Der Offline-
-- Aufholpass des Spiels hängt daran: savedAt im Blob stammt von der
-- Uhr des Geräts, das zuletzt gespeichert hat. Ein Tablet mit falsch
-- gestellter Uhr könnte das Aufhol-Fenster sonst wiederholt abgreifen
-- oder ganz verlieren. Im Gast-Modus (kein Login) gibt es keine
-- zweite Uhr, dort bleibt es bei savedAt.
create or replace function load_game_save(p_game_id text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_row     record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select save, save_version, rev, updated_at
    into v_row
    from user_game_saves
   where user_id = v_user_id and game_id = p_game_id;

  if not found then
    return jsonb_build_object('ok', true, 'save', null);
  end if;

  return jsonb_build_object(
    'ok',           true,
    'save',         v_row.save,
    'save_version', v_row.save_version,
    'rev',          v_row.rev,
    'updated_at',   v_row.updated_at,
    'age_sec',      floor(extract(epoch from (now() - v_row.updated_at)))
  );
end;
$$;

revoke all on function load_game_save(text) from public;
grant execute on function load_game_save(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) sync_game_save(p_game_id, p_save, p_save_version, p_base_rev)
-- ─────────────────────────────────────────────────────────────
-- Schreibt den Blob und zählt rev hoch. Rückgabe { ok, rev }.
--
-- p_base_rev = die rev, die der Client beim Laden gesehen hat.
--   • stimmt sie → schreiben, rev + 1
--   • stimmt sie nicht → 'stale_rev' samt aktuellem Serverstand.
--     Ein zweites Gerät hat inzwischen geschrieben; der Client
--     überschreibt das nicht blind.
--   • null → erzwingt den Schreibvorgang (erster Save, nach Reset).
create or replace function sync_game_save(
  p_game_id      text,
  p_save         jsonb,
  p_save_version int,
  p_base_rev     bigint
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  MAX_BYTES    constant int      := 400000;             -- Sabotage-Schutz, kein Balance-Wert
  MIN_INTERVAL constant interval := interval '3 seconds'; -- Client drosselt auf 20 s, das hier ist die Wand
  v_user_id  uuid := auth.uid();
  v_session  record;
  v_game     record;
  v_old      record;
  v_rev      bigint;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_save is null or jsonb_typeof(p_save) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if octet_length(p_save::text) > MAX_BYTES then
    return jsonb_build_object('ok', false, 'error', 'payload_too_large');
  end if;

  select id, status, season into v_session from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;

  select id, season, active into v_game from games where id = p_game_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;
  if not v_game.active then
    return jsonb_build_object('ok', false, 'error', 'game_inactive');
  end if;
  if v_game.season > v_session.season then
    return jsonb_build_object('ok', false, 'error', 'season_locked');
  end if;

  select rev, updated_at into v_old
    from user_game_saves
   where user_id = v_user_id and game_id = p_game_id;

  if found then
    -- ⚠️ Direkter interval-Vergleich statt `(epoch * 1000)::int` wie in 0016.
    -- Dort werden Zeilen im Sekundentakt geschrieben; hier kann ein
    -- Spielstand monatelang liegen, und ein halbes Jahr in Millisekunden
    -- (1,5e10) sprengt den int-Bereich — die RPC würde mit „integer out of
    -- range" sterben, ausgerechnet beim Wiedereinstieg nach langer Pause.
    if (now() - v_old.updated_at) < MIN_INTERVAL then
      -- Kein cheat_flags-Eintrag: anders als bei Punkte-Submissions ist ein
      -- zu schneller Save hier kein Betrugsindiz, sondern zwei offene Tabs
      -- oder ein Sofort-Push kurz nach dem Takt-Push.
      return jsonb_build_object('ok', false, 'error', 'rate_limit');
    end if;

    if p_base_rev is not null and p_base_rev <> v_old.rev then
      return jsonb_build_object(
        'ok',    false,
        'error', 'stale_rev',
        'rev',   v_old.rev
      );
    end if;
  end if;

  insert into user_game_saves (user_id, game_id, save, save_version, rev, updated_at)
  values (v_user_id, p_game_id, p_save, coalesce(p_save_version, 1), 1, now())
  on conflict (user_id, game_id) do update set
    save         = excluded.save,
    save_version = excluded.save_version,
    rev          = user_game_saves.rev + 1,
    updated_at   = now()
  returning rev into v_rev;

  return jsonb_build_object('ok', true, 'rev', v_rev);
end;
$$;

revoke all on function sync_game_save(text, jsonb, int, bigint) from public;
grant execute on function sync_game_save(text, jsonb, int, bigint) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) reset_game_save(p_game_id text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Löscht die Zeile. Braucht der Debug-Knopf „Kompletter Neustart" —
-- ohne ihn zieht der nächste Boot den gerade gelöschten Stand vom
-- Server zurück und der Neustart wäre wirkungslos.
create or replace function reset_game_save(p_game_id text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  delete from user_game_saves
   where user_id = v_user_id and game_id = p_game_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function reset_game_save(text) from public;
grant execute on function reset_game_save(text) to authenticated;
