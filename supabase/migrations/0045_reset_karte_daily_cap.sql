-- ══════════════════════════════════════════════════════════════
-- Migration 0045 — Reset-Karte: max 1× pro Tag (Variante 1)
-- ══════════════════════════════════════════════════════════════
-- Der Bestand an Reset-Karten darf beliebig groß werden (kaufen
-- + horten), aber nur EINE Karte pro Kalendertag (Europe/Berlin)
-- kann aktiviert werden. Server-authoritativ — Client-Reload
-- kann den Cap nicht umgehen.
--
-- Tracking-Feld auf wallets: last_reset_karte_date. Wird gesetzt
-- wenn reset_daily_bonbon_claims() erfolgreich läuft; wenn der
-- Wert == heute, wird eine erneute Aktivierung mit 'reset_limit_daily'
-- abgelehnt.
--
-- get_daily_bonbon_status() gibt zusätzlich reset_used_today
-- zurück, damit der Client den „Einsetzen"-Button ausgrauen kann
-- ohne einen fehlgeschlagenen RPC-Aufruf zu produzieren.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Wallet-Spalte für Reset-Karte-Cap
-- ─────────────────────────────────────────────────────────────
alter table wallets
  add column if not exists last_reset_karte_date date;

comment on column wallets.last_reset_karte_date is
  'Datum der letzten Reset-Karte-Aktivierung (Europe/Berlin). Cap: max 1× pro Kalendertag.';


-- ─────────────────────────────────────────────────────────────
-- 2) reset_daily_bonbon_claims — Cap-Prüfung
-- ─────────────────────────────────────────────────────────────
create or replace function reset_daily_bonbon_claims()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_today   date := (now() at time zone 'Europe/Berlin')::date;
  v_last    date;
  v_cleared int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select last_reset_karte_date into v_last
    from wallets where user_id = v_user_id;

  if v_last is not null and v_last = v_today then
    return jsonb_build_object(
      'ok', false,
      'error', 'reset_limit_daily',
      'used_at', to_char(v_last, 'YYYY-MM-DD')
    );
  end if;

  delete from bonbon_daily_claims where user_id = v_user_id;
  get diagnostics v_cleared = row_count;

  -- Reset-Marker setzen. UPSERT falls Wallet-Zeile noch nicht existiert
  -- (User ohne wallets-Zeile ist selten, aber möglich vor erstem add_bonbons).
  insert into wallets (user_id, coins, bonbons, last_reset_karte_date, updated_at)
  values (v_user_id, 0, 0, v_today, now())
  on conflict (user_id) do update set
    last_reset_karte_date = excluded.last_reset_karte_date,
    updated_at            = now();

  return jsonb_build_object(
    'ok', true,
    'cleared', v_cleared,
    'reset_used_today', true,
    'today', to_char(v_today, 'YYYY-MM-DD')
  );
end;
$$;

revoke all on function reset_daily_bonbon_claims() from public;
grant execute on function reset_daily_bonbon_claims() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) get_daily_bonbon_status — reset_used_today ergänzen
-- ─────────────────────────────────────────────────────────────
create or replace function get_daily_bonbon_status()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_today   date := (now() at time zone 'Europe/Berlin')::date;
  v_claims  jsonb;
  v_last    date;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(
    jsonb_object_agg(kachel_key, to_char(last_claim, 'YYYY-MM-DD')),
    '{}'::jsonb
  ) into v_claims
  from bonbon_daily_claims
  where user_id = v_user_id
    and last_claim >= (v_today - interval '2 days')::date;

  select last_reset_karte_date into v_last
    from wallets where user_id = v_user_id;

  return jsonb_build_object(
    'ok',               true,
    'today',            to_char(v_today, 'YYYY-MM-DD'),
    'claims',           v_claims,
    'reset_used_today', (v_last is not null and v_last = v_today)
  );
end;
$$;

revoke all on function get_daily_bonbon_status() from public;
grant execute on function get_daily_bonbon_status() to authenticated;
