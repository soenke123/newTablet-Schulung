-- ══════════════════════════════════════════════════════════════
-- Migration 0032 — Regenbogen-Bonbons (Season 3 Kern-Feature)
-- ══════════════════════════════════════════════════════════════
-- Kooperative Cluster-Ressource. Jeder User hat einen persönlichen
-- Bonbon-Zähler; die Summe aller Cluster-Mitglieder ist der Kurs-
-- Fortschritt. Erreicht diese das Cluster-Ziel `bonbon_target`,
-- schaltet der Kurs als Team den Legendary „Rosa Einhorntiger" +
-- Legi-Trainer-Spiel (game16) frei.
--
-- Diese Migration liefert das Datenmodell + die Basis-RPCs.
-- Die Verdienst-Mechanik (welches Spiel droppt wie viel) und
-- der Signup-Hook für Späteinsteiger kommen in Folge-Iterationen.
--
-- Design-Entscheidungen:
--   • Bonbon-Konto ist USER-scoped (wallets.bonbons). Der User
--     nimmt seinen Zähler bei Cluster-Wechsel mit. Der Ziel-Cluster
--     bekommt die Beiträge sofort in seine SUM.
--   • Cluster-Ziel ist Pflicht bei season>=3. Änderung des Ziels
--     lässt bereits gesammelte Bonbons unangetastet.
--   • Freischaltung ist einmalig monoton (bonbons_unlocked_at wird
--     nie wieder null). Legi-Grants sind pro (User, Cluster)
--     idempotent — Muster wie cluster_bonus_grants.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clusters — Zielwert + Freischalt-Zeitstempel
-- ─────────────────────────────────────────────────────────────
alter table clusters
  add column if not exists bonbon_target int,
  add column if not exists bonbons_unlocked_at timestamptz;

-- Constraint: S3-Cluster brauchen ein positives Ziel.
-- S1/S2 dürfen NULL bleiben. Kein S3-Cluster existiert aktuell,
-- daher kann der Check ohne NOT VALID direkt greifen.
alter table clusters
  add constraint clusters_bonbon_target_required
  check (season < 3 or (bonbon_target is not null and bonbon_target > 0));

comment on column clusters.bonbon_target is
  'Zielwert für kooperativen Bonbon-Pool. Pflicht ab season 3. '
  'Änderungen wirken nur auf den Freischalt-Vergleich, nicht auf '
  'die bereits gesammelten Bonbons (die leben auf wallets.bonbons).';
comment on column clusters.bonbons_unlocked_at is
  'Zeitpunkt der Legi-Freischaltung dieses Clusters. Monoton — '
  'einmal gesetzt, bleibt gesetzt, auch wenn das Ziel später erhöht wird.';


-- ─────────────────────────────────────────────────────────────
-- 2) wallets — persönlicher Bonbon-Zähler
-- ─────────────────────────────────────────────────────────────
alter table wallets
  add column if not exists bonbons int not null default 0
  check (bonbons >= 0);

comment on column wallets.bonbons is
  'Persönlicher Regenbogen-Bonbon-Zähler. User-scoped, wandert bei '
  'Cluster-Wechsel mit. Wird über add_bonbons() gebumpt.';


-- ─────────────────────────────────────────────────────────────
-- 3) user_legi_grants — Idempotenz-Marker für Legi-Freischaltung
-- ─────────────────────────────────────────────────────────────
-- Analog zu cluster_bonus_grants (Migration 0020): pro (User,
-- Cluster) darf der Legi genau einmal ausgeschüttet werden.
-- Cluster-Wechsel A→B: wenn beide Cluster ihr Ziel erreichen,
-- bekommt der User in beiden Clustern jeweils einen Grant.
create table user_legi_grants (
  user_id     uuid not null references auth.users(id) on delete cascade,
  cluster_id  uuid not null references clusters(id)   on delete cascade,
  granted_at  timestamptz not null default now(),
  primary key (user_id, cluster_id)
);

create index user_legi_grants_user_idx on user_legi_grants(user_id);

alter table user_legi_grants enable row level security;

create policy ulg_select_own on user_legi_grants
  for select using (user_id = auth.uid());

create policy ulg_admin_select_all on user_legi_grants
  for select using (is_admin());

-- Kein direktes INSERT für authenticated — nur via SECURITY-DEFINER-RPC.
grant select on user_legi_grants to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Games — game16 (Legi-Trainer) registrieren
-- ─────────────────────────────────────────────────────────────
-- Metadatenzeile für das gesperrte Legi-Trainer-Panel. Freigabe
-- wird clientseitig über cluster_locked-Access-State und Legi-
-- Grant kontrolliert. Kein Passwort.
insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game16', 3, 'S3 LegiTrainer', 'Legi-Trainer', '🌈', null, false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;


-- ─────────────────────────────────────────────────────────────
-- 5) check_and_grant_cluster_legi(p_cluster_id) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Intern von add_bonbons() aufgerufen. Prüft, ob Cluster-Summe
-- ≥ Ziel ist und schaltet ggf. Legi frei:
--   • bonbons_unlocked_at wird gesetzt (nur wenn noch NULL).
--   • Legi-Grants für alle aktuellen Cluster-Mitglieder anlegen
--     (ON CONFLICT DO NOTHING → idempotent).
-- Späteinsteiger, die JOIN nachdem der Cluster längst unlocked
-- ist, bekommen ihren Grant beim nächsten add_bonbons-Trigger
-- (Follow-up-Iteration: eigener Signup-Hook).
create or replace function check_and_grant_cluster_legi(p_cluster_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_cluster   record;
  v_collected int;
  v_grants_added int := 0;
begin
  select id, season, bonbon_target, bonbons_unlocked_at
    into v_cluster
  from clusters where id = p_cluster_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cluster_not_found');
  end if;
  if v_cluster.season < 3 or v_cluster.bonbon_target is null then
    return jsonb_build_object('ok', true, 'skipped', 'not_s3');
  end if;

  -- Cluster-Summe über alle aktiven Mitglieder
  select coalesce(sum(w.bonbons), 0)::int into v_collected
  from profiles p
  left join wallets w on w.user_id = p.id
  where p.cluster_id = p_cluster_id and p.status = 'active';

  if v_collected < v_cluster.bonbon_target then
    return jsonb_build_object(
      'ok', true, 'unlocked', false,
      'collected', v_collected, 'target', v_cluster.bonbon_target
    );
  end if;

  -- Ziel erreicht — Cluster-Timestamp setzen (nur beim ersten Mal)
  if v_cluster.bonbons_unlocked_at is null then
    update clusters set bonbons_unlocked_at = now() where id = p_cluster_id;
  end if;

  -- Grants für alle aktiven Mitglieder (idempotent)
  insert into user_legi_grants (user_id, cluster_id, granted_at)
  select p.id, p_cluster_id, now()
  from profiles p
  where p.cluster_id = p_cluster_id and p.status = 'active'
  on conflict (user_id, cluster_id) do nothing;
  get diagnostics v_grants_added = row_count;

  return jsonb_build_object(
    'ok', true, 'unlocked', true,
    'collected', v_collected, 'target', v_cluster.bonbon_target,
    'grants_added', v_grants_added
  );
end;
$$;

revoke all on function check_and_grant_cluster_legi(uuid) from public;
grant execute on function check_and_grant_cluster_legi(uuid) to authenticated;
grant execute on function check_and_grant_cluster_legi(uuid) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 6) add_bonbons(p_amount int) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Aufgerufen von Season-3-Spielen nach jeder Runde (Verdienst-
-- Mechanik kommt in eigener Iteration). Bumpt wallets.bonbons und
-- prüft anschließend das Cluster-Ziel.
--
-- Sabotage-Cap: p_amount muss in [1, 500] liegen. Höher braucht
-- kein legitimer Drop pro Runde.
create or replace function add_bonbons(p_amount int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session    record;
  v_new_total  int;
  v_unlock_res jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 500 then
    return jsonb_build_object('ok', false, 'error', 'amount_out_of_range');
  end if;

  select id, cluster_id, season, status
    into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;
  if v_session.season < 3 then
    return jsonb_build_object('ok', true, 'skipped', 'season_below_3');
  end if;

  insert into wallets (user_id, coins, bonbons, updated_at)
  values (v_user_id, 0, p_amount, now())
  on conflict (user_id) do update set
    bonbons    = wallets.bonbons + p_amount,
    updated_at = now()
  returning bonbons into v_new_total;

  if v_session.cluster_id is not null then
    v_unlock_res := check_and_grant_cluster_legi(v_session.cluster_id);
  else
    v_unlock_res := jsonb_build_object('skipped', 'no_cluster');
  end if;

  return jsonb_build_object(
    'ok', true,
    'bonbons', v_new_total,
    'cluster', v_unlock_res
  );
end;
$$;

revoke all on function add_bonbons(int) from public;
grant execute on function add_bonbons(int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) get_cluster_bonbon_status() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Frontend-Getter für Regenbogen-Balken + Bonbon-Modal.
--   { enabled: bool,
--     target: int, collected: int, own_amount: int,
--     unlocked: bool, unlocked_at: iso|null,
--     milestones: [{percent: 25|50|75|100, reached: bool}] }
create or replace function get_cluster_bonbon_status()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id   uuid := auth.uid();
  v_session   record;
  v_cluster   record;
  v_collected int;
  v_own       int;
  v_target    int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, cluster_id, season, status
    into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if v_session.season < 3 or v_session.cluster_id is null then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  select id, bonbon_target, bonbons_unlocked_at
    into v_cluster
  from clusters where id = v_session.cluster_id;
  if not found or v_cluster.bonbon_target is null then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  v_target := v_cluster.bonbon_target;

  select coalesce(sum(w.bonbons), 0)::int into v_collected
  from profiles p
  left join wallets w on w.user_id = p.id
  where p.cluster_id = v_session.cluster_id and p.status = 'active';

  select coalesce(bonbons, 0) into v_own
  from wallets where user_id = v_user_id;
  v_own := coalesce(v_own, 0);

  return jsonb_build_object(
    'ok',          true,
    'enabled',     true,
    'target',      v_target,
    'collected',   v_collected,
    'own_amount',  v_own,
    'unlocked',    v_cluster.bonbons_unlocked_at is not null,
    'unlocked_at', v_cluster.bonbons_unlocked_at,
    'milestones',  jsonb_build_array(
      jsonb_build_object('percent', 25,  'reached', v_collected >= (v_target * 25  / 100)),
      jsonb_build_object('percent', 50,  'reached', v_collected >= (v_target * 50  / 100)),
      jsonb_build_object('percent', 75,  'reached', v_collected >= (v_target * 75  / 100)),
      jsonb_build_object('percent', 100, 'reached', v_collected >= v_target)
    )
  );
end;
$$;

revoke all on function get_cluster_bonbon_status() from public;
grant execute on function get_cluster_bonbon_status() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) admin_cluster_bonbon_totals() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Admin-Übersicht für alle S3-Cluster der eigenen Schule. Liefert
-- pro Cluster {cluster_id, collected}. Zieht die Bonbon-Summen
-- in einem Rutsch — vermeidet N+1-Aufrufe im Admin-Panel.
create or replace function admin_cluster_bonbon_totals()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_school  uuid;
  v_result  jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  select school_id into v_school from profiles where id = v_user_id;
  if v_school is null then
    return jsonb_build_object('ok', false, 'error', 'no_school');
  end if;

  with cluster_totals as (
    select
      c.id as cluster_id,
      coalesce(sum(w.bonbons), 0)::int as collected
    from clusters c
    left join profiles p on p.cluster_id = c.id and p.status = 'active'
    left join wallets  w on w.user_id = p.id
    where c.school_id = v_school and c.season >= 3
    group by c.id
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'cluster_id', cluster_id,
             'collected',  collected
           )
         ), '[]'::jsonb)
    into v_result
  from cluster_totals;

  return jsonb_build_object('ok', true, 'clusters', v_result);
end;
$$;

revoke all on function admin_cluster_bonbon_totals() from public;
grant execute on function admin_cluster_bonbon_totals() to authenticated;
