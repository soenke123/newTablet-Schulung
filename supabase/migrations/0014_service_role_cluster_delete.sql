-- ══════════════════════════════════════════════════════════════
-- Migration 0014 — service_role: DELETE-Recht auf clusters
-- ══════════════════════════════════════════════════════════════
-- Migration 0002 hat service_role nur SELECT auf clusters gegeben.
-- Die Vercel-Function /api/admin_delete_cluster nutzt den
-- service_role-Client für den finalen DELETE. Ohne diesen Grant
-- schlägt der Call mit „permission denied for table clusters" fehl.
--
-- INSERT/UPDATE laufen weiterhin über RLS-geschützte user-Calls,
-- deshalb nur DELETE — nicht ALL — an service_role vergeben.
-- ══════════════════════════════════════════════════════════════

grant delete on clusters to service_role;
