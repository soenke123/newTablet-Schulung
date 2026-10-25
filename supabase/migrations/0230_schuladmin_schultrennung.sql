-- ══════════════════════════════════════════════════════════════
-- Migration 0230 — Schuladmins sehen nur Spieldaten der eigenen Schule
-- ══════════════════════════════════════════════════════════════
-- Fund (Sicherheitsprüfung 25.10.2026): 0053 hat die Regel
-- „Schuladmin nur eigene Schule“ für profiles, clusters und schools
-- eingeführt. Die älteren Admin-Policies auf den Spieldaten (0012,
-- 0016, 0020, 0037, 0061, 0183 …) prüften aber weiter nur is_admin().
-- Ein Schuladmin konnte damit Spielstände, Geldbörsen, Spielstände im
-- Speicher, Freundesräume und Schummel-Meldungen ALLER Schulen lesen
-- (ohne Namen — profiles war getrennt) und über cluster_bonus den
-- Startbonus der Kurse anderer Schulen ändern oder löschen.
-- apply_cluster_bonus nahm ebenfalls jeden Nutzer an.
--
-- Ab hier:
--   • Lese-Policies: Volladmin alles, Schuladmin nur Zeilen von
--     Nutzern seiner Schule (user_id → profiles.school_id).
--   • cluster_bonus: Volladmin alles, Schuladmin nur Kurse seiner
--     Schule (lesen und schreiben).
--   • apply_cluster_bonus: Schuladmin nur für Nutzer seiner Schule,
--     sonst 'cross_school_forbidden'. Aufrufe ohne Anmeldung
--     (service_role aus api/signup.js, api/admin_reset_user_progress.js)
--     bleiben unverändert.
--
-- Die Unterabfragen auf profiles/clusters laufen mit den Rechten der
-- Aufruferin; beide Tabellen zeigen einem Schuladmin ohnehin nur die
-- eigene Schule. is_admin()/is_superadmin() verlangen seit 0223 aal2.
--
-- Zweiter Lauf: Policies werden einfach erneut gesetzt; die Funktion
-- wird übersprungen, wenn die Prüfung schon drin ist.
--
-- Prüfstand: supabase/tests/0230_schuladmin_schultrennung.mjs
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) Lese-Policies mit user_id
-- ─────────────────────────────────────────────────────────────
do $mig$
declare
  r record;
begin
  for r in select * from (values
    ('cheat_flags',                         'cheat_flags_admin_select'),
    ('cluster_bonus_grants',                'cbg_admin_select_all'),
    ('friends_room_presence',               'frp_admin_select_all'),
    ('game_state',                          'gs_select_admin'),
    ('shop_daily_gains',                    'shop_daily_gains_admin_select'),
    ('user_bonbon_milestone_grants',        'ubmg_admin_select_all'),
    ('user_collectibles',                   'uc_select_admin'),
    ('user_einhornkatze_completion_grants', 'uecg_admin_select_all'),
    ('user_game_saves',                     'ugs_admin_select_all'),
    ('user_legi_grants',                    'ulg_admin_select_all'),
    ('user_legi_path',                      'ulp_admin_select_all'),
    ('user_legi_task_gifts',                'ultg_admin_select_all'),
    ('user_legi_virus_progress',            'ulvp_admin_select_all'),
    ('user_unlocked_games',                 'uug_select_admin'),
    ('wallets',                             'wallets_select_admin')
  ) as t(tbl, pol)
  loop
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = r.tbl and policyname = r.pol) then
      raise exception '0230: Policy %.% nicht gefunden', r.tbl, r.pol;
    end if;
    execute format($p$alter policy %I on %I using (
      is_superadmin()
      or (is_admin() and user_id in (select p.id from profiles p where p.school_id = my_school_id()))
    )$p$, r.pol, r.tbl);
  end loop;
end
$mig$;

-- ─────────────────────────────────────────────────────────────
-- 2) cluster_bonus: lesen und schreiben nur für Kurse der eigenen Schule
-- ─────────────────────────────────────────────────────────────
alter policy cluster_bonus_admin_all on cluster_bonus
  using (
    is_superadmin()
    or (is_admin() and cluster_id in (select c.id from clusters c where c.school_id = my_school_id()))
  )
  with check (
    is_superadmin()
    or (is_admin() and cluster_id in (select c.id from clusters c where c.school_id = my_school_id()))
  );

-- ─────────────────────────────────────────────────────────────
-- 3) apply_cluster_bonus: Schuladmin nur für die eigene Schule
-- ─────────────────────────────────────────────────────────────
-- Wie in 0223: heutigen Rumpf lesen und an einer Stelle ergänzen.
-- Die Prüfung kommt direkt hinter das Laden des Ziels (danach steht
-- fest, dass es das Konto gibt). Findet sich die Stelle nicht, bricht
-- die Migration ab, statt still nichts zu tun.
do $mig$
declare
  v_src text;
  v_new text;
  v_anchor constant text := '  if coalesce(v_target.is_admin, false)';
begin
  v_src := pg_get_functiondef('apply_cluster_bonus(uuid)'::regprocedure);
  if position('cross_school_forbidden' in v_src) > 0 then
    raise notice '0230: apply_cluster_bonus schon umgestellt, übersprungen';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0230: Stelle in apply_cluster_bonus nicht eindeutig gefunden';
  end if;
  v_new := replace(v_src, v_anchor,
'  -- 0230: Schuladmin nur für Nutzer der eigenen Schule
  if v_caller is not null and not is_superadmin()
     and not exists (select 1 from profiles t
                      where t.id = p_user_id and t.school_id = my_school_id()) then
    return jsonb_build_object(''ok'', false, ''error'', ''cross_school_forbidden'');
  end if;

' || v_anchor);
  execute v_new;
end
$mig$;
