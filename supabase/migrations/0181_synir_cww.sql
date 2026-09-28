-- ══════════════════════════════════════════════════════════════
-- Migration 0181 — SYNIR: das Class Wide Web (cww)
-- ══════════════════════════════════════════════════════════════
-- Das Modem aus Filius, nur dass am anderen Ende die Netze der ganzen
-- Klasse liegen. Jedes Tablet simuliert sein eigenes Netz (im
-- Browser, mit eigener Uhr). Verlässt ein Paket dort das cww, landet
-- es HIER, und das Tablet, dem die Zieladresse gehört, holt es bei
-- seiner nächsten Abfrage ab. Siehe tools/synir/js/internet.js.
--
-- ── Adressbereiche ────────────────────────────────────────────
-- Jedes Kind bekommt ein /8 aus 50…150, zufällig und ohne 100 —
-- die 100 hat immer die Lehrkraft (für einen „Schulserver", den alle
-- erreichen). Dazu eine zufällige Adresse im 8er-Netz (8.x.y.z), dem
-- Knoten, an dem alle cwws hängen. Beides steht in synir_cww_netz.
-- Wem welches /8 gehört, sieht nur die Lehrkraft (synir_cww_karte).
--
-- ── Ein Aufruf für alles: synir_cww_tausch ────────────────────
-- Das Tablet schickt, was hinaus soll, und bekommt zurück, was für
-- es da ist — in EINEM Aufruf, alle 0,7 bis 3 Sekunden. Zwei Aufrufe
-- (senden, holen) wären doppelt so viele Anfragen für dieselbe Stunde.
--
-- Der Server prüft, was ein echter Anbieter auch prüft: der Absender
-- eines Pakets muss im eigenen /8 liegen (Ingress-Filtering, BCP 38).
-- Sonst könnte ein Kind im Namen eines anderen senden.
--
-- Unzustellbar ist ein Paket an ein /8, das niemandem gehört — oder
-- an ein Tablet, das seit 20 Sekunden nicht mehr gefragt hat
-- (zugeklappt, Reiter im Hintergrund). Es kommt als `unzustellbar`
-- zurück, und das cww des Absenders meldet „Ziel nicht erreichbar".
--
-- ── 8.8.8.8 ───────────────────────────────────────────────────
-- Jedes Tablet meldet mit jedem Tausch die Namen seiner öffentlich
-- erreichbaren DNS-Server (synir_cww_name). Wer einen Namen zuerst
-- anmeldet, bekommt ihn; wer später kommt, erfährt „vergeben".
-- A-Einträge müssen ins eigene /8 zeigen — auch das prüft der Server.
--
-- Kein DROP — idempotent per `if not exists` / `create or replace`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Tabellen
-- ─────────────────────────────────────────────────────────────
create table if not exists synir_cww_netz (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  -- null = die Lehrkraft des Raums
  participant_id uuid references skill_participants(id) on delete cascade,
  prefix         int  not null,
  backbone       text not null,
  seen_at        timestamptz not null default now(),
  constraint synir_cww_netz_prefix check (prefix between 1 and 223),
  constraint synir_cww_netz_room_prefix unique (room_id, prefix),
  constraint synir_cww_netz_room_backbone unique (room_id, backbone)
);
create unique index if not exists synir_cww_netz_teilnehmer
  on synir_cww_netz(participant_id) where participant_id is not null;
create unique index if not exists synir_cww_netz_lehrkraft
  on synir_cww_netz(room_id) where participant_id is null;

comment on table synir_cww_netz is
  'SYNIR Class Wide Web: welches /8 und welche 8er-Adresse ein Tablet (oder die Lehrkraft, '
  'participant_id null) in einem Raum hat. seen_at = letzte Abfrage.';

create table if not exists synir_cww_paket (
  id          bigserial primary key,
  room_id     uuid not null references skill_rooms(id) on delete cascade,
  an_prefix   int  not null,
  von_prefix  int  not null,
  paket       jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists synir_cww_paket_ziel on synir_cww_paket(room_id, an_prefix, id);

comment on table synir_cww_paket is
  'SYNIR Class Wide Web: Pakete unterwegs zwischen zwei Tablets. Werden beim Abholen '
  'gelöscht; was nach 60 s noch liegt, verfällt.';

create table if not exists synir_cww_name (
  room_id     uuid not null references skill_rooms(id) on delete cascade,
  typ         text not null,
  name        text not null,
  wert        text not null,
  prefix      int  not null,
  updated_at  timestamptz not null default now(),
  primary key (room_id, typ, name),
  constraint synir_cww_name_typ check (typ in ('A', 'MX'))
);

comment on table synir_cww_name is
  'SYNIR Class Wide Web: was 8.8.8.8 kennt. Ein Name gehört dem /8, das ihn zuerst angemeldet hat.';

alter table synir_cww_netz  enable row level security;
alter table synir_cww_paket enable row level security;
alter table synir_cww_name  enable row level security;
-- Keine Policy: nur über die Funktionen unten.


-- ─────────────────────────────────────────────────────────────
-- 2) Anmelden: Adressbereich und 8er-Adresse vergeben
-- ─────────────────────────────────────────────────────────────
-- Intern, von beiden Türen gerufen. p_participant null = Lehrkraft.
create or replace function synir_cww_vergeben(p_room uuid, p_participant uuid)
  returns synir_cww_netz
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_row    synir_cww_netz;
  v_prefix int;
  v_bb     text;
  i        int;
begin
  if p_participant is null then
    select * into v_row from synir_cww_netz where room_id = p_room and participant_id is null;
  else
    select * into v_row from synir_cww_netz where participant_id = p_participant;
  end if;
  if v_row.id is not null then
    return v_row;
  end if;

  for i in 1..20 loop
    if p_participant is null then
      v_prefix := 100;
    else
      select p into v_prefix
        from generate_series(50, 150) p
       where p <> 100
         and not exists (select 1 from synir_cww_netz n where n.room_id = p_room and n.prefix = p)
       order by random()
       limit 1;
      if v_prefix is null then
        return null;                     -- Raum voll (100 Bereiche)
      end if;
    end if;
    -- 8.x.y.z ohne 8.8.8.8 und ohne Netz-/Rundrufadressen
    v_bb := '8.' || (floor(random() * 254) + 1)::int || '.'
                 || (floor(random() * 254) + 1)::int || '.'
                 || (floor(random() * 254) + 1)::int;
    if v_bb = '8.8.8.8' then continue; end if;
    begin
      insert into synir_cww_netz (room_id, participant_id, prefix, backbone)
      values (p_room, p_participant, v_prefix, v_bb)
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      -- Gleichzeitig vergeben — mit einer anderen Zahl noch einmal.
      if p_participant is not null then
        select * into v_row from synir_cww_netz where participant_id = p_participant;
      else
        select * into v_row from synir_cww_netz where room_id = p_room and participant_id is null;
      end if;
      if v_row.id is not null then return v_row; end if;
    end;
  end loop;
  return null;
end;
$$;

revoke all on function synir_cww_vergeben(uuid, uuid) from public;


create or replace function synir_cww_anmelden(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_row  synir_cww_netz;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_room.tool_id <> 'synir' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  v_row := synir_cww_vergeben(v_room.id, v_p.id);
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'cww_voll');
  end if;
  return jsonb_build_object('ok', true, 'prefix', v_row.prefix, 'backbone', v_row.backbone);
end;
$$;

revoke all on function synir_cww_anmelden(text) from public;
grant execute on function synir_cww_anmelden(text) to anon, authenticated;


create or replace function synir_cww_anmelden_lehrer(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_row  synir_cww_netz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_row := synir_cww_vergeben(v_room.id, null);
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'cww_voll');
  end if;
  return jsonb_build_object('ok', true, 'prefix', v_row.prefix, 'backbone', v_row.backbone);
end;
$$;

revoke all on function synir_cww_anmelden_lehrer(text) from public;
grant execute on function synir_cww_anmelden_lehrer(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Der Tausch
-- ─────────────────────────────────────────────────────────────
-- Intern: `v_me` ist die Zeile des Rufenden aus synir_cww_netz.
--
-- p_raus   [paket, …]          höchstens 200 Pakete, zusammen 300 KB
-- p_namen  [{typ,name,wert}, …] die volle Liste der eigenen Namen, oder
--                               null = unverändert lassen
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

  return jsonb_build_object('ok', true,
    'prefix', v_me.prefix, 'backbone', v_me.backbone,
    'pakete', v_rein, 'unzustellbar', v_unzu,
    'verzeichnis', v_verz, 'vergeben', v_vergeben);
end;
$$;

revoke all on function synir_cww_tausch_intern(synir_cww_netz, jsonb, jsonb) from public;


create or replace function synir_cww_tausch(p_token text, p_raus jsonb default null, p_namen jsonb default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_me   synir_cww_netz;
  v_data jsonb;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  -- Blind: nichts geht hinaus, nichts kommt herein — wie bei synir_work_put.
  select coalesce(data, '{}'::jsonb) into v_data from skill_room_state where room_id = v_room.id;
  if coalesce((v_data->>'blind')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'blind');
  end if;
  select * into v_me from synir_cww_netz where participant_id = v_p.id;
  if v_me.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return synir_cww_tausch_intern(v_me, p_raus, p_namen);
end;
$$;

revoke all on function synir_cww_tausch(text, jsonb, jsonb) from public;
grant execute on function synir_cww_tausch(text, jsonb, jsonb) to anon, authenticated;


create or replace function synir_cww_tausch_lehrer(p_code text, p_raus jsonb default null, p_namen jsonb default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_me   synir_cww_netz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_me from synir_cww_netz where room_id = v_room.id and participant_id is null;
  if v_me.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return synir_cww_tausch_intern(v_me, p_raus, p_namen);
end;
$$;

revoke all on function synir_cww_tausch_lehrer(text, jsonb, jsonb) from public;
grant execute on function synir_cww_tausch_lehrer(text, jsonb, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Die Karte: wem gehört welches /8 (nur Lehrkraft)
-- ─────────────────────────────────────────────────────────────
create or replace function synir_cww_karte(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'prefix',   n.prefix,
             'backbone', n.backbone,
             'name',     case when n.participant_id is null then 'Lehrkraft'
                              else coalesce(p.name, 'Tablet ' || p.seat) end,
             'seen_at',  n.seen_at,
             'namen',    (select count(*) from synir_cww_name nm
                           where nm.room_id = n.room_id and nm.prefix = n.prefix))
           order by n.prefix)
      from synir_cww_netz n
      left join skill_participants p on p.id = n.participant_id
     where n.room_id = v_room.id), '[]'::jsonb));
end;
$$;

revoke all on function synir_cww_karte(text) from public;
grant execute on function synir_cww_karte(text) to authenticated;
