-- ══════════════════════════════════════════════════════════════
-- Migration 0038 — friends_room_presence: Realtime-taugliche RLS
-- ══════════════════════════════════════════════════════════════
-- Bug: Postgres-Changes-Events kamen im Test nicht bei den bereits
-- eingeloggten Clients an (nur der letzte User sah den vollen Raum).
-- Ursache: die 0037er-Policy frp_select_room_peers nutzt einen
-- EXISTS-Selfjoin auf friends_room_presence — Supabase Realtime
-- kann komplexe Sub-Query-Policies bei Postgres-Change-Evaluation
-- nicht zuverlässig verarbeiten.
--
-- Fix: zusätzliche, plain SELECT-Policy „gleicher Cluster wie
-- der Aufrufer". Kein EXISTS, keine Self-Reference. Realtime
-- kann das direkt filtern.
--
-- Sicherheit bleibt cluster-geschlossen — User in Cluster A sehen
-- keine Rows aus Cluster B. Innerhalb des eigenen Clusters ist die
-- ganze Presence-Tabelle sichtbar; das ist unkritisch, weil die
-- Rows nur (user_id, cluster_id, code, timestamps) enthalten und
-- via last_seen_at ohnehin nur 30 s aktiv sind. Zusätzliche Härtung
-- über den Snapshot-RPC (SECURITY DEFINER) bleibt bestehen.
--
-- Alte Policy bleibt drin — Policies sind OR-verknüpft, die neue
-- zieht in der Praxis immer zuerst.
-- ══════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'friends_room_presence'
       and policyname = 'frp_select_cluster_members'
  ) then
    create policy frp_select_cluster_members on friends_room_presence
      for select using (
        cluster_id = (select cluster_id from profiles where id = auth.uid())
      );
  end if;
end $$;
