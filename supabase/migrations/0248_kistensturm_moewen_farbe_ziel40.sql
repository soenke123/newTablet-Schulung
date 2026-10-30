-- ══════════════════════════════════════════════════════════════
-- Migration 0248 — Definitions Derby: Kistensturm, 3 Möwen klauen immer 3,
--                  Kisten behalten ihre Farbe, Zielhöhe 40
-- ══════════════════════════════════════════════════════════════
-- Sönke 30.10.2026:
--   „3 Möwen klauen manchmal immer noch nur einen. Die sollen immer 3
--    klauen, am besten von vorne, aber falls es nicht anders geht auch
--    doppelt oder von Leuten, die hinter einem sind.“
--   „Bekommen wir das hin, dass die Pakete die Farbe behalten, wenn sie
--    bei Kuddelmuddel oder durch die Möwe geklaut werden? Dass man sieht,
--    von wem was ist?“ (nimmt 0246 zurück)
--   „Default … Höhe 40.“
--
-- Vorher nahm „3 Möwen“ nur die (bis zu drei) Teams davor je einmal: bei
-- 3 Teams vom Letzten also 2, vom Zweiten 1, und eine Steinkiste oben
-- ließ eine Möwe leer zurückkommen.
-- Jetzt: Bedarf 3 (Möwe: 1). Reihum über die Teams davor (nächstes
-- zuerst, auch mehrfach), dann über die Teams dahinter. Nimmt nur, was
-- dd_storm_take_top hergibt (kein Stein, kein Eis). Gibt es gar nichts,
-- bleibt es bei weniger. Ereignis: data.g = [{t, b}] in Klau-Reihenfolge
-- (für mehrere Möwen vom selben Team), data.b<t> bleibt für alte Geräte.
--
-- Ersetzt dd_storm_use (sonst wortgleich mit 0247). Idempotent.
-- ══════════════════════════════════════════════════════════════

alter table dd_storm_boards alter column goal set default 40;

create or replace function dd_storm_use(p_token text, p_slot int, p_since bigint default 0)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v       record;
  v_b     dd_storm_boards;
  v_pl    dd_storm_players;
  v_t     dd_storm_teams;
  v_o     dd_storm_teams;
  v_it    text;
  v_me    int;
  v_rk    int;
  v_tg    int[] := '{}';
  v_tt    int;
  v_x     jsonb;
  v_bx    jsonb;
  v_i     int;
  v_cut   numeric;
  v_out   jsonb;
  v_all   jsonb;
  v_cnt   int;
  v_pos   int;
  v_data  jsonb := '{}'::jsonb;
  v_need  int;
  v_got   int;
  v_more  boolean;
  v_pass  int;
  v_list  int[];
  v_grab  jsonb := '[]'::jsonb;
begin
  select * into v from dd_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if (v.p).removed_at is not null then return jsonb_build_object('ok', false, 'error', 'removed'); end if;
  perform dd_storm_ensure((v.room).id);
  perform dd_storm_advance((v.room).id);
  select * into v_b from dd_storm_boards where room_id = (v.room).id for update;
  if v_b.phase <> 'running' then
    return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'not_running');
  end if;
  v_pl := dd_storm_join(v.p, v_b);
  select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_pl.team;
  if v_t.team is null or p_slot is null or p_slot < 0 or p_slot >= jsonb_array_length(v_t.items) then
    return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'no_item');
  end if;
  if v_t.tea_until is not null and v_t.tea_until > now() then
    return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'tea');
  end if;
  -- Nur wer das Item hält — außer der Halter ist nicht mehr da (0247).
  if (v_t.items_who->>p_slot) is not null and (v_t.items_who->>p_slot)::uuid <> (v.p).id and exists (
       select 1 from dd_storm_players pl join skill_participants p on p.id = pl.participant_id
        where p.id = (v_t.items_who->>p_slot)::uuid and pl.room_id = v_b.room_id and pl.team = v_t.team
          and p.removed_at is null and not p.blocked and p.last_seen_at > now() - interval '90 seconds') then
    return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'not_yours');
  end if;
  v_me := v_t.team;
  v_it := v_t.items->>p_slot;
  update dd_storm_teams set items = items - p_slot, items_who = items_who - p_slot where room_id = v_b.room_id and team = v_me;
  select r.rk into v_rk from dd_storm_ranks(v_b.room_id) r where r.team = v_me;

  if v_it = 'bonus' then
    select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_me;
    perform dd_storm_put(v_b.room_id, v_me,
      jsonb_build_array(jsonb_build_object('k', 'g', 't', v_me), jsonb_build_object('k', 'g', 't', v_me)) || v_t.boxes);
  elsif v_it = 'stein' then
    select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_me;
    perform dd_storm_put(v_b.room_id, v_me, jsonb_build_array(jsonb_build_object('k', 's', 't', v_me)) || v_t.boxes);
  elsif v_it in ('moewe', 'moewe3') then
    -- 0248: Möwe 1, 3 Möwen IMMER 3 Kisten (solange es irgendwo welche gibt).
    -- Erst die Teams davor, das nächste zuerst — reihum, also auch doppelt;
    -- erst wenn davor nichts mehr zu holen ist, die Teams dahinter (das
    -- nächste zuerst). Die Kiste behält ihre Farbe (man sieht, von wem sie ist).
    v_need := case when v_it = 'moewe' then 1 else 3 end;
    v_got := 0;
    for v_pass in 1 .. 2 loop
      if v_pass = 1 then
        select coalesce(array_agg(r.team order by r.rk desc), '{}') into v_list from dd_storm_ranks(v_b.room_id) r where r.rk < v_rk;
      else
        select coalesce(array_agg(r.team order by r.rk), '{}') into v_list from dd_storm_ranks(v_b.room_id) r where r.rk > v_rk;
      end if;
      loop
        exit when v_got >= v_need or coalesce(array_length(v_list, 1), 0) = 0;
        v_more := false;
        foreach v_tt in array v_list loop
          exit when v_got >= v_need;
          v_x := dd_storm_take_top(v_b.room_id, v_tt);
          if v_x is not null then
            select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_me;
            perform dd_storm_put(v_b.room_id, v_me, v_t.boxes || jsonb_build_array(v_x));
            if not (v_tt = any(v_tg)) then v_tg := v_tg || v_tt; end if;
            v_data := v_data || jsonb_build_object('b' || v_tt, v_x);
            v_grab := v_grab || jsonb_build_array(jsonb_build_object('t', v_tt, 'b', v_x));
            v_got := v_got + 1;
            v_more := true;
          end if;
        end loop;
        exit when not v_more;
      end loop;
    end loop;
    v_data := v_data || jsonb_build_object('g', v_grab);
  elsif v_it = 'maxi' then
    update dd_storm_teams set maxi_until = now() + interval '20 seconds', mini_until = null
     where room_id = v_b.room_id and team = v_me;
  elsif v_it = 'mini' then
    for v_tt in select r.team from dd_storm_ranks(v_b.room_id) r where r.rk < v_rk order by r.rk desc limit 2 loop
      update dd_storm_teams set mini_until = now() + interval '20 seconds', maxi_until = null
       where room_id = v_b.room_id and team = v_tt;
      v_tg := v_tg || v_tt;
    end loop;
  elsif v_it = 'sturm' then
    update dd_storm_boards set storm_until = now() + interval '30 seconds' where room_id = v_b.room_id;
  elsif v_it = 'tea' then
    for v_tt in select r.team from dd_storm_ranks(v_b.room_id) r where r.team <> v_me order by r.rk limit 2 loop
      update dd_storm_teams set tea_until = now() + interval '10 seconds' where room_id = v_b.room_id and team = v_tt;
      v_tg := v_tg || v_tt;
    end loop;
  elsif v_it = 'bus' then
    for v_o in select * from dd_storm_teams where room_id = v_b.room_id order by team loop
      v_cut := 0; v_i := 0;
      while v_i < jsonb_array_length(v_o.boxes) and v_cut < 5 loop
        v_cut := v_cut + dd_storm_bsize(v_o.boxes->v_i->>'k');
        v_i := v_i + 1;
      end loop;
      select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_out
        from jsonb_array_elements(v_o.boxes) with ordinality x(e, o) where o > v_i;
      perform dd_storm_put(v_b.room_id, v_o.team, v_out);
      v_data := v_data || jsonb_build_object('n' || v_o.team, v_i);
      v_tg := v_tg || v_o.team;
    end loop;
  elsif v_it = 'boom' then
    select r.team into v_tt from dd_storm_ranks(v_b.room_id) r where r.rk = 1;
    select * into v_o from dd_storm_teams where room_id = v_b.room_id and team = v_tt;
    v_cnt := 0; v_i := jsonb_array_length(v_o.boxes) - 1; v_out := v_o.boxes;
    while v_i >= 0 and v_cnt < 5 loop
      v_cnt := v_cnt + 1;
      if v_out->v_i->>'k' = 's' then
        v_out := v_out - v_i;
        exit;
      end if;
      v_out := v_out - v_i;
      v_i := v_i - 1;
    end loop;
    perform dd_storm_put(v_b.room_id, v_tt, v_out);
    v_tg := array[v_tt];
    v_data := jsonb_build_object('n', v_cnt);
  elsif v_it = 'eis' then
    select t.team into v_tt from dd_storm_teams t where t.room_id = v_b.room_id and t.team <> v_me order by random() limit 1;
    if v_tt is not null then
      select * into v_o from dd_storm_teams where room_id = v_b.room_id and team = v_tt;
      -- ganz unten hinein: ein Fehler nimmt nur, was danach darunter wächst
      perform dd_storm_put(v_b.room_id, v_tt, jsonb_build_array(jsonb_build_object('k', 'i', 't', v_tt, 'n', 5)) || v_o.boxes);
      v_tg := array[v_tt];
    end if;
  elsif v_it = 'kuddel' then
    select coalesce(jsonb_agg(e order by random()), '[]'::jsonb) into v_all
      from dd_storm_teams t, jsonb_array_elements(t.boxes) e where t.room_id = v_b.room_id;
    v_pos := 0;
    for v_o in select * from dd_storm_teams where room_id = v_b.room_id order by team loop
      v_cnt := jsonb_array_length(v_o.boxes);
      -- 0248: jede Kiste behält ihre Farbe — man sieht, von wem sie ist
      select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_out
        from jsonb_array_elements(v_all) with ordinality x(e, o) where o > v_pos and o <= v_pos + v_cnt;
      perform dd_storm_put(v_b.room_id, v_o.team, v_out);
      v_pos := v_pos + v_cnt;
      v_tg := v_tg || v_o.team;
    end loop;
  end if;

  perform dd_storm_ev(v_b.room_id, 'use', v_me, dd_storm_name(v.p),
    (select height from dd_storm_teams where room_id = v_b.room_id and team = v_me),
    v_data || jsonb_build_object('it', v_it, 'tg', to_jsonb(v_tg)));
  -- Wer durch das Item gewachsen ist, kann Linien überqueren; dann Sieg prüfen.
  perform dd_storm_award(v_b.room_id, v_me);
  perform dd_storm_check_win(v_b.room_id);
  perform skill_touch(v_b.room_id);
  return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'ok', 'used', v_it);
end;
$$;
revoke all on function dd_storm_use(text, int, bigint) from public;
grant execute on function dd_storm_use(text, int, bigint) to anon, authenticated;
