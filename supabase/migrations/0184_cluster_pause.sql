-- ══════════════════════════════════════════════════════════════
-- Migration 0184 — GameHub-Pause pro Kurs
-- ══════════════════════════════════════════════════════════════
-- Eine Lehrkraft (Schul- oder Volladmin) kann das GameHub für einen
-- Kurs kurz anhalten: im Hub und in jedem Spiel legt sich ein
-- Overlay über die Seite, die Spiele stehen still und laufen nach
-- dem Ende der Pause an derselben Stelle weiter. Der Schalter sitzt
-- im Admin-Panel in der Kurs-Tabelle neben „Spiele".
--
-- ── Datenmodell ───────────────────────────────────────────────
-- clusters.paused_at: NULL = läuft, sonst Zeitpunkt, seit dem der
-- Kurs pausiert ist. Wie bei cluster_unlocked_games schreibt nur
-- die RPC (set_cluster_pause); gelesen wird über
-- get_my_cluster_pause(), damit Schüler keine Tabellenrechte
-- brauchen und der Aufruf billig bleibt.
--
-- ── Wer ist betroffen ─────────────────────────────────────────
-- Nur Mitglieder des Kurses. Admins ohne eigenen Kurs bekommen
-- immer false — sie sperren sich nie selbst aus.
--
-- Kein DROP — Idempotenz per add column if not exists / create or
-- replace (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalte
-- ─────────────────────────────────────────────────────────────
alter table clusters
  add column if not exists paused_at timestamptz;

comment on column clusters.paused_at is
  'GameHub für diesen Kurs pausiert seit … (NULL = läuft). Gesetzt über set_cluster_pause().';


-- ─────────────────────────────────────────────────────────────
-- 2) set_cluster_pause(cluster, paused) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Gleiches Muster wie set_cluster_game_access (0070/0072): Admin-
-- Prüfung, Ziel über board_target_cluster (Schuladmin nur eigene
-- Schule, Volladmin jeder Kurs).
create or replace function set_cluster_pause(
  p_cluster_id uuid,
  p_paused     boolean
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_paused  boolean := coalesce(p_paused, false);
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

  -- Eine laufende Pause nicht neu datieren, wenn sie schon steht.
  update clusters
     set paused_at = case
           when v_paused then coalesce(paused_at, now())
           else null
         end
   where id = v_cluster;

  return jsonb_build_object(
    'ok',         true,
    'cluster_id', v_cluster,
    'paused',     v_paused
  );
end;
$$;

revoke all on function set_cluster_pause(uuid, boolean) from public;
grant execute on function set_cluster_pause(uuid, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) get_my_cluster_pause() → boolean
-- ─────────────────────────────────────────────────────────────
-- Pausiert der eigene Kurs? Wer keinen Kurs hat (Lehrkraft ohne Kurs,
-- nicht eingeloggt) oder Admin ist, bekommt false.
create or replace function get_my_cluster_pause()
  returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select coalesce(
    (select c.paused_at is not null
       from profiles p
       join clusters c on c.id = p.cluster_id
      where p.id = auth.uid()
        and not (p.is_admin or p.is_superadmin)),
    false);
$$;

revoke all on function get_my_cluster_pause() from public;
grant execute on function get_my_cluster_pause() to authenticated;
