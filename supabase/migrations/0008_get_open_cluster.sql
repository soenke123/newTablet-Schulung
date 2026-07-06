-- ══════════════════════════════════════════════════════════════
-- Migration 0008 — RPC get_open_cluster(school_slug)
-- ══════════════════════════════════════════════════════════════
-- Signup-Modal (anon) muss anzeigen können, ob gerade ein Kurs
-- offen ist. Ein SECURITY-DEFINER-RPC ist minimaler als eine
-- clusters-SELECT-Policy für anon: die Function gibt genau die
-- Felder zurück, die das UI braucht, nichts drumherum.
-- ══════════════════════════════════════════════════════════════

create or replace function get_open_cluster(p_school_slug text)
returns table (
  name       text,
  season     int,
  closes_at  timestamptz
)
security definer
stable
set search_path = public
language sql
as $$
  select c.name, c.season, c.closes_at
  from clusters c
  join schools  s on s.id = c.school_id
  where s.slug   = lower(p_school_slug)
    and s.active = true
    and c.opens_at  <= now()
    and c.closes_at >= now()
  order by c.opens_at desc
  limit 1;
$$;

revoke all on function get_open_cluster(text) from public;
grant execute on function get_open_cluster(text) to anon, authenticated;

comment on function get_open_cluster(text) is
  'Öffentliche Info für das Signup-Modal: aktuell offener Kurs einer Schule (oder leer).';
