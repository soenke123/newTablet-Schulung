-- ══════════════════════════════════════════════════════════════
-- Migration 0182 — SYNIR: das cww nennt die Bereiche der anderen
-- ══════════════════════════════════════════════════════════════
-- Der Reiter „Internet" am cww zeigt jetzt, welche Adressbereiche
-- (/8) über das Class Wide Web erreichbar sind: 13.0.0.0/8,
-- 14.0.0.0/8, … — sobald die anderen im Raum sind.
--
-- Dazu bekommt die Antwort von synir_cww_tausch ein Feld `bereiche`:
-- die Zahlen aller anderen Tablets (und der Lehrkraft) im Raum, die in
-- den letzten 20 Sekunden gefragt haben. Kein Name, kein Besitzer —
-- so, wie ein Router im echten Internet Präfixe kennt und keine
-- Kunden. Sonst bleibt alles wie in 0181.
--
-- Nur `synir_cww_tausch_intern` wird ersetzt; die beiden Türen
-- (tausch, tausch_lehrer) reichen die Antwort unverändert durch.
-- Kein DROP — idempotent per `create or replace`.
-- ══════════════════════════════════════════════════════════════

create or replace function synir_cww_tausch_intern(v_me synir_cww_netz, p_raus jsonb, p_namen jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p        jsonb;
  v_dst      text;
  v_src      text;
  v_octet    int;
  v_ziel     synir_cww_netz;
  v_unzu     jsonb := '[]'::jsonb;
  v_rein     jsonb;
  v_verz     jsonb;
  v_vergeben jsonb := '[]'::jsonb;
  v_bereiche jsonb;
  v_n        jsonb;
  v_typ      text;
  v_name     text;
  v_wert     text;
  v_eigene   text[] := '{}';
  v_besitz   int;
  v_ip_re    constant text := '^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$';
begin
  update synir_cww_netz set seen_at = now() where id = v_me.id;

  -- Aufräumen: verfallene Pakete, und die Namen von Tablets, die seit
  -- zehn Minuten nicht mehr gefragt haben (sonst hielte ein Kind, das
  -- gegangen ist, „www.shop.de" für den Rest der Stunde fest).
  delete from synir_cww_paket
   where room_id = v_me.room_id and created_at < now() - interval '60 seconds';
  delete from synir_cww_name nm
   where nm.room_id = v_me.room_id
     and not exists (select 1 from synir_cww_netz n
                      where n.room_id = nm.room_id and n.prefix = nm.prefix
                        and n.seen_at > now() - interval '10 minutes');

  -- ─ Hinaus ─
  if p_raus is not null then
    if jsonb_typeof(p_raus) <> 'array' then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    if jsonb_array_length(p_raus) > 200 or octet_length(p_raus::text) > 300000 then
      return jsonb_build_object('ok', false, 'error', 'payload_too_big');
    end if;
    for v_p in select value from jsonb_array_elements(p_raus) loop
      if jsonb_typeof(v_p) <> 'object' then continue; end if;
      v_dst := v_p->>'dst';
      v_src := v_p->>'src';
      if v_dst is null or v_src is null or v_dst !~ v_ip_re or v_src !~ v_ip_re then continue; end if;
      -- Absenderprüfung: nur aus dem eigenen /8 (oder die eigene 8er-Adresse).
      if split_part(v_src, '.', 1)::int <> v_me.prefix and v_src <> v_me.backbone then continue; end if;

      v_octet := split_part(v_dst, '.', 1)::int;
      v_ziel := null;
      if v_octet = 8 then
        select * into v_ziel from synir_cww_netz where room_id = v_me.room_id and backbone = v_dst;
      else
        select * into v_ziel from synir_cww_netz where room_id = v_me.room_id and prefix = v_octet;
      end if;

      if v_ziel.id is null or v_ziel.id = v_me.id
         or v_ziel.seen_at < now() - interval '20 seconds' then
        v_unzu := v_unzu || jsonb_build_array(v_p);
      else
        insert into synir_cww_paket (room_id, an_prefix, von_prefix, paket)
        values (v_me.room_id, v_ziel.prefix, v_me.prefix, v_p);
      end if;
    end loop;
  end if;

  -- ─ Namen ─
  if p_namen is not null and jsonb_typeof(p_namen) = 'array' then
    for v_n in select value from jsonb_array_elements(p_namen) limit 50 loop
      v_typ  := v_n->>'typ';
      v_name := lower(btrim(coalesce(v_n->>'name', '')));
      v_wert := lower(btrim(coalesce(v_n->>'wert', '')));
      if v_typ not in ('A', 'MX') then continue; end if;
      if v_name !~ '^[a-z0-9._-]{1,120}$' or char_length(v_wert) not between 1 and 120 then continue; end if;
      -- Ein A-Eintrag spricht nur für das eigene /8.
      if v_typ = 'A' and (v_wert !~ v_ip_re or split_part(v_wert, '.', 1)::int <> v_me.prefix) then continue; end if;

      v_eigene := v_eigene || (v_typ || '|' || v_name);
      select prefix into v_besitz from synir_cww_name
       where room_id = v_me.room_id and typ = v_typ and name = v_name;
      if v_besitz is null then
        insert into synir_cww_name (room_id, typ, name, wert, prefix)
        values (v_me.room_id, v_typ, v_name, v_wert, v_me.prefix)
        on conflict (room_id, typ, name) do nothing;
        select prefix into v_besitz from synir_cww_name
         where room_id = v_me.room_id and typ = v_typ and name = v_name;
      end if;
      if v_besitz = v_me.prefix then
        update synir_cww_name set wert = v_wert, updated_at = now()
         where room_id = v_me.room_id and typ = v_typ and name = v_name and wert <> v_wert;
      else
        v_vergeben := v_vergeben || jsonb_build_array(jsonb_build_object('typ', v_typ, 'name', v_name));
      end if;
    end loop;
    -- Was nicht mehr in der Liste steht, gibt das Tablet frei.
    delete from synir_cww_name
     where room_id = v_me.room_id and prefix = v_me.prefix
       and not ((typ || '|' || name) = any (v_eigene));
  end if;

  -- ─ Herein ─ (abholen heißt löschen)
  with weg as (
    delete from synir_cww_paket
     where room_id = v_me.room_id and an_prefix = v_me.prefix
    returning id, paket
  )
  select coalesce(jsonb_agg(paket order by id), '[]'::jsonb) into v_rein from weg;

  -- ─ Das Verzeichnis ─ ohne Besitzer: das weiß 8.8.8.8 auch nicht.
  select coalesce(jsonb_agg(jsonb_build_object('typ', typ, 'name', name, 'wert', wert)
                            order by name, typ), '[]'::jsonb)
    into v_verz
    from synir_cww_name where room_id = v_me.room_id;

  -- ─ Die Bereiche der anderen ─ Nur die Zahlen, ohne Besitzer (wer
  -- welches /8 hat, weiß nur die Lehrkraft, siehe synir_cww_karte).
  -- Wer seit 20 Sekunden nicht gefragt hat, ist nicht erreichbar —
  -- dieselbe Frist wie bei „unzustellbar" oben.
  select coalesce(jsonb_agg(prefix order by prefix), '[]'::jsonb)
    into v_bereiche
    from synir_cww_netz
   where room_id = v_me.room_id and id <> v_me.id
     and seen_at > now() - interval '20 seconds';

  return jsonb_build_object('ok', true,
    'prefix', v_me.prefix, 'backbone', v_me.backbone,
    'pakete', v_rein, 'unzustellbar', v_unzu,
    'verzeichnis', v_verz, 'vergeben', v_vergeben,
    'bereiche', v_bereiche);
end;
$$;

revoke all on function synir_cww_tausch_intern(synir_cww_netz, jsonb, jsonb) from public;
