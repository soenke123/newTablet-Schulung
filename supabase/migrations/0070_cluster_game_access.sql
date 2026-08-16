-- ══════════════════════════════════════════════════════════════
-- Migration 0070 — Kurs-Freischaltung statt Spiel-Passwörter
-- ══════════════════════════════════════════════════════════════
-- Bis hierher entschied ein Passwort je Spiel, wer spielen darf
-- (games.password_hash + unlock_game aus 0004 + user_unlocked_games).
-- Das ist ein Relikt der Frontend-only-Zeit und passt nicht zu dem,
-- was im Raum passiert: ein Passwort ist ein Geheimnis PRO SPIEL, das
-- die Lehrkraft einmal ansagt und danach nicht mehr zurücknehmen kann.
-- Es wandert in den nächsten Kurs, und ein Kurs, der noch nicht so
-- weit ist, hat es trotzdem.
--
-- Ab jetzt gilt ein Schalter PRO (KURS, SPIEL), den ein Admin oder
-- Schuladmin in beide Richtungen bedient. Grundzustand: alles zu.
--
-- Wichtig: Sperren LÖSCHT NICHTS. game_state, Kreaturen, Wachstum,
-- Münzen und Highscores bleiben unangetastet — das Spiel ist nur
-- nicht mehr startbar und wirft (siehe 0071) keine Bonbons mehr ab.
--
-- Reihenfolge in dieser Datei:
--   1) Tabelle cluster_unlocked_games
--   2) RLS (nur SELECT — geschrieben wird ausschließlich per RPC)
--   3) is_game_open_for_cluster() — der eine Lesepunkt
--   4) board_target_cluster() — Kommentar nachziehen, kein Neubau
--   5) set_cluster_game_access()   — ein Spiel auf/zu
--   6) set_cluster_season_access() — eine Season auf/zu
--   7) Backfill für bestehende Kurse
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) cluster_unlocked_games
-- ─────────────────────────────────────────────────────────────
-- Bewusst parallel zu user_unlocked_games gebaut:
--   ZEILE VORHANDEN = freigeschaltet, Sperren = Zeile löschen.
-- Kein boolean-Feld. Sonst gäbe es einen dritten Zustand ("Zeile da,
-- aber false"), den zwei Lesestellen unterschiedlich auslegen können.
create table if not exists cluster_unlocked_games (
  cluster_id   uuid not null references clusters(id) on delete cascade,
  game_id      text not null references games(id)    on delete cascade,
  unlocked_at  timestamptz not null default now(),
  unlocked_by  uuid references auth.users(id) on delete set null,
  primary key (cluster_id, game_id)
);

create index if not exists cluster_unlocked_games_cluster_idx
  on cluster_unlocked_games(cluster_id);

comment on table cluster_unlocked_games is
  'Welche Spiele sind für welchen Kurs offen. Zeile vorhanden = offen, '
  'keine Zeile = gesperrt. Geschaltet von Admins/Schuladmins über '
  'set_cluster_game_access(). Ersetzt die Spiel-Passwörter aus 0004.';

comment on column cluster_unlocked_games.unlocked_by is
  'Wer zuletzt freigeschaltet hat. Beim Sperren verschwindet die Zeile, '
  'die Information also mit ihr — das ist kein Audit-Log, sondern eine '
  'Hilfe für die Rückfrage "wer hat das aufgemacht?".';


-- ─────────────────────────────────────────────────────────────
-- 2) RLS — nur SELECT für authenticated
-- ─────────────────────────────────────────────────────────────
-- Wie bei board_notes/board_state (0062): Lesen per Policy,
-- Schreiben ausschließlich über SECURITY-DEFINER-RPCs.
-- Idempotenz per DO-Block statt "drop policy if exists" — sonst
-- meldet Supabase die Migration als destruktiv.
alter table cluster_unlocked_games enable row level security;

do $$
begin
  -- Schüler: der eigene Kurs. Die Liste ist das, was der Hub pollt.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'cluster_unlocked_games'
       and policyname = 'cug_select_own_cluster'
  ) then
    create policy cug_select_own_cluster on cluster_unlocked_games
      for select using (
        cluster_id = (select cluster_id from profiles where id = auth.uid())
      );
  end if;

  -- Admins: die Kurse der eigenen Schule, Volladmin alle. Nötig, weil
  -- Admins in keinem Kurs hängen (Beobachter-Rolle, 0053) und trotzdem
  -- sehen müssen, was sie gerade schalten.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'cluster_unlocked_games'
       and policyname = 'cug_select_admin'
  ) then
    create policy cug_select_admin on cluster_unlocked_games
      for select using (
        is_any_admin() and (
          is_superadmin()
          or cluster_id in (select id from clusters where school_id = my_school_id())
        )
      );
  end if;
end $$;

grant select on cluster_unlocked_games to authenticated;
-- service_role explizit, sonst "permission denied" trotz service_role.
grant select, insert, update, delete on cluster_unlocked_games to service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) is_game_open_for_cluster(cluster_id, game_id) → boolean
-- ─────────────────────────────────────────────────────────────
-- Der eine Lesepunkt. Steht hier und nicht dreimal ausgeschrieben in
-- 0071, damit die Frage "ist das offen?" genau eine Antwort hat.
--
-- NULL-Kurs (User ohne Cluster, Admin ohne Zuordnung) → false. Wer in
-- keinem Kurs ist, hat auch keinen, der etwas freischalten könnte.
create or replace function is_game_open_for_cluster(
  p_cluster_id uuid,
  p_game_id    text
)
  returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select exists (
    select 1 from cluster_unlocked_games
     where cluster_id = p_cluster_id
       and game_id    = p_game_id
  );
$$;

revoke all on function is_game_open_for_cluster(uuid, text) from public;
grant execute on function is_game_open_for_cluster(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) board_target_cluster() — Kommentar nachziehen
-- ─────────────────────────────────────────────────────────────
-- Die Funktion aus 0062 löst genau die Frage, die auch hier ansteht:
-- auf welchem Kurs arbeitet der Aufrufer? (Schüler → eigener Kurs;
-- Schuladmin → Kurse der eigenen Schule; Volladmin → jeder; sonst
-- NULL). Sie wird deshalb wiederverwendet und NICHT kopiert — eine
-- zweite Fassung einer rechte-relevanten Prüfung wäre eine zweite
-- Stelle, die man beim nächsten Rollen-Umbau vergessen kann.
comment on function board_target_cluster(uuid) is
  'Allgemeiner Kurs-Auflöser für alle kurs-geteilten Features. Der '
  'board_-Präfix ist historisch (Migration 0062, Reality Check); seit '
  '0070 hängt auch die Spiel-Freischaltung daran.';


-- ─────────────────────────────────────────────────────────────
-- 5) set_cluster_game_access(cluster_id, game_id, open) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Rückgabe:
--   { ok: true, cluster_id, game_id, open }
--   { ok: false, error: 'not_authenticated' | 'not_admin'
--                     | 'no_cluster' | 'game_not_found' }
--
-- is_any_admin() zusätzlich zu board_target_cluster(): letzteres würde
-- einem Schüler brav seinen eigenen Kurs liefern, und der soll sich
-- nicht selbst freischalten können.
create or replace function set_cluster_game_access(
  p_cluster_id uuid,
  p_game_id    text,
  p_open       boolean
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  if not exists (select 1 from games where id = p_game_id and active) then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;

  if coalesce(p_open, false) then
    insert into cluster_unlocked_games (cluster_id, game_id, unlocked_by)
    values (v_cluster, p_game_id, v_user)
    on conflict (cluster_id, game_id) do update
      set unlocked_at = now(),
          unlocked_by = excluded.unlocked_by;
  else
    delete from cluster_unlocked_games
     where cluster_id = v_cluster and game_id = p_game_id;
  end if;

  return jsonb_build_object(
    'ok',         true,
    'cluster_id', v_cluster,
    'game_id',    p_game_id,
    'open',       coalesce(p_open, false)
  );
end;
$$;

revoke all on function set_cluster_game_access(uuid, text, boolean) from public;
grant execute on function set_cluster_game_access(uuid, text, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) set_cluster_season_access(cluster_id, season, open) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Massen-Schalter "Season komplett auf/zu". Ohne ihn müsste eine
-- Lehrkraft für jeden neuen Kurs sechs bis sieben Kacheln einzeln
-- antippen, bevor die Stunde losgeht.
--
-- Rückgabe: { ok: true, cluster_id, season, open, changed: int }
create or replace function set_cluster_season_access(
  p_cluster_id uuid,
  p_season     int,
  p_open       boolean
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_changed int := 0;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if p_season is null or p_season < 1 or p_season > 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_season');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  if coalesce(p_open, false) then
    with ins as (
      insert into cluster_unlocked_games (cluster_id, game_id, unlocked_by)
      select v_cluster, g.id, v_user
        from games g
       where g.season = p_season and g.active
      on conflict (cluster_id, game_id) do nothing
      returning 1
    )
    select count(*)::int into v_changed from ins;
  else
    with del as (
      delete from cluster_unlocked_games cug
       using games g
       where cug.cluster_id = v_cluster
         and cug.game_id    = g.id
         and g.season       = p_season
      returning 1
    )
    select count(*)::int into v_changed from del;
  end if;

  return jsonb_build_object(
    'ok',         true,
    'cluster_id', v_cluster,
    'season',     p_season,
    'open',       coalesce(p_open, false),
    'changed',    v_changed
  );
end;
$$;

revoke all on function set_cluster_season_access(uuid, int, boolean) from public;
grant execute on function set_cluster_season_access(uuid, int, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Backfill — bestehenden Kursen bricht nichts weg
-- ─────────────────────────────────────────────────────────────
-- Grundzustand ist "alles zu". Ohne Backfill stünden nach dem Deploy
-- alle laufenden Kurse vor lauter Schlössern und ihre Monster wären
-- unsichtbar (nicht weg, aber das merkt in dem Moment niemand).
--
-- Deshalb: jedes Spiel öffnen, das in dem Kurs nachweislich schon
-- läuft — belegt entweder durch einen Spielstand (game_state) oder
-- durch ein eingelöstes Passwort (user_unlocked_games). Genau dafür
-- bleibt user_unlocked_games stehen und wird nicht gedroppt.
insert into cluster_unlocked_games (cluster_id, game_id)
select distinct p.cluster_id, e.game_id
  from profiles p
  join (
    select user_id, game_id from game_state
    union
    select user_id, game_id from user_unlocked_games
  ) e on e.user_id = p.id
  join games g on g.id = e.game_id and g.active
 where p.cluster_id is not null
on conflict (cluster_id, game_id) do nothing;

-- Sonderfall Einhornkatze (game16): ab 0071 hängt das ganze
-- Bonbon-Prinzip an dieser Kachel — solange sie zu ist, entstehen im
-- Kurs gar keine Bonbons. Die Lehrkraft soll diesen Moment selbst
-- eröffnen, deshalb bleibt sie beim Umstieg grundsätzlich zu.
--
-- Ausnahme: Kurse, in denen das Sammeln schon läuft. Denen die Kachel
-- zuzumachen hieße, eine laufende Sammlung stillzulegen, ohne dass
-- irgendwo stünde, warum. "Läuft schon" = der Legi ist vergeben oder
-- irgendjemand hat bereits Bonbons.
delete from cluster_unlocked_games cug
 where cug.game_id = 'game16'
   and not exists (
     select 1 from user_legi_grants ulg
      where ulg.cluster_id = cug.cluster_id
   )
   and not exists (
     select 1
       from profiles p
       join wallets w on w.user_id = p.id
      where p.cluster_id = cug.cluster_id
        and coalesce(w.bonbons, 0) > 0
   );
