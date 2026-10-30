-- ══════════════════════════════════════════════════════════════
-- Migration 0245 — Definitions Derby: Kistensturm, Eiskiste unten
-- ══════════════════════════════════════════════════════════════
-- Sönke 30.10.2026: „Der Eisblock soll ganz unten sein. Man verliert
-- nur die neuen Steine, nicht die davor erspielten.“
--
-- Bisher legte das Item „eis“ die Eiskiste OBEN auf den Turm; ein
-- Fehler ließ alles darunter wegrutschen, also den ganzen Turm.
-- Jetzt kommt sie GANZ UNTEN hinein. Neue Kisten aus Antworten
-- (und Bonus/Stein) wachsen weiter unten hinein, also unter das Eis.
-- Ein Fehler, solange das Eis offen ist, nimmt nur diese neuen Kisten
-- (dd_storm_ice aus 0240 bleibt: „alles unter der untersten offenen
-- Eiskiste“); was vorher erspielt war, liegt über dem Eis und bleibt.
--
-- Ersetzt nur dd_storm_use (sonst wortgleich mit 0240). Idempotent.
-- ══════════════════════════════════════════════════════════════

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
  v_me := v_t.team;
  v_it := v_t.items->>p_slot;
  update dd_storm_teams set items = items - p_slot where room_id = v_b.room_id and team = v_me;
  select r.rk into v_rk from dd_storm_ranks(v_b.room_id) r where r.team = v_me;

  if v_it = 'bonus' then
    select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_me;
    perform dd_storm_put(v_b.room_id, v_me,
      jsonb_build_array(jsonb_build_object('k', 'g', 't', v_me), jsonb_build_object('k', 'g', 't', v_me)) || v_t.boxes);
  elsif v_it = 'stein' then
    select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_me;
    perform dd_storm_put(v_b.room_id, v_me, jsonb_build_array(jsonb_build_object('k', 's', 't', v_me)) || v_t.boxes);
  elsif v_it in ('moewe', 'moewe3') then
    -- Teams direkt davor, das nächste zuerst
    for v_tt in select r.team from dd_storm_ranks(v_b.room_id) r where r.rk < v_rk order by r.rk desc
                 limit case when v_it = 'moewe' then 1 else 3 end loop
      v_x := dd_storm_take_top(v_b.room_id, v_tt);
      if v_x is not null then
        select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_me;
        perform dd_storm_put(v_b.room_id, v_me, v_t.boxes || jsonb_build_array(v_x));
        v_tg := v_tg || v_tt;
        v_data := v_data || jsonb_build_object('b' || v_tt, v_x);
      end if;
    end loop;
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
