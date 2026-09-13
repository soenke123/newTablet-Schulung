-- ═══════════════════════════════════════════════════════════════
-- 0144 · Tip Turbo Kids — Cheat-Highscores raus, Server-Cap rein
-- ═══════════════════════════════════════════════════════════════
-- Sönke, 12.09.2026: Schüler haben in "Tip Turbo Kids" (game11)
-- eine Lücke gefunden und sich Highscores > 1000 fabriziert. Die
-- Lücke im Spiel selbst ist bereits geschlossen (Client-Cap auf
-- 1000). Diese Migration räumt die vorhandenen Fake-Scores aus der
-- DB und riegelt den Weg serverseitig ab, damit ein neuer Client-
-- Exploit nicht wieder ungeprüft in game_highscores landet.
--
-- Absprache: Cheat-Highscores werden GELÖSCHT (nicht auf 1000
-- gekappt) — die Schüler starten für game11 wieder bei 0. Das ist
-- so gewollt ("das ist ok für die Schüler").
-- ═══════════════════════════════════════════════════════════════

delete from game_highscores
where game_id = 'game11'
  and best_score > 1000;


-- ─────────────────────────────────────────────────────────────
-- upsert_highscore neu: zusätzlicher Per-Game-Cap für game11
-- ─────────────────────────────────────────────────────────────
-- Kopiert 1:1 aus 0019 (höchststehende Fassung) und ergänzt nur den
-- game11-Cap zwischen dem generischen Sabotage-Cap und dem Game-Lookup.
create or replace function upsert_highscore(p_game_id text, p_score int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_status  text;
  v_season  int;
  v_game    record;
  v_new_best int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_score is null or p_score < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_score');
  end if;

  -- Sabotage-Cap: absurde Werte kappen (1 Mrd ist selbst für Endless zuviel)
  if p_score > 1000000000 then
    return jsonb_build_object('ok', false, 'error', 'score_out_of_range');
  end if;

  -- Per-Game-Cap: game11 (Tip Turbo Kids) hatte einen Client-Exploit,
  -- der Scores weit über das ehrlich erreichbare Maximum (~550) trieb.
  if p_game_id = 'game11' and p_score > 1000 then
    return jsonb_build_object('ok', false, 'error', 'score_out_of_range');
  end if;

  select status, season into v_status, v_season
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;

  select id, season, active into v_game from games where id = p_game_id;
  if not found or not v_game.active then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;
  if v_game.season > v_season then
    return jsonb_build_object('ok', false, 'error', 'season_locked');
  end if;

  insert into game_highscores (user_id, game_id, best_score, updated_at)
  values (v_user_id, p_game_id, p_score, now())
  on conflict (user_id, game_id) do update
    set best_score = greatest(game_highscores.best_score, excluded.best_score),
        updated_at = case
                       when excluded.best_score > game_highscores.best_score then now()
                       else game_highscores.updated_at
                     end
  returning best_score into v_new_best;

  return jsonb_build_object('ok', true, 'best_score', v_new_best);
end;
$$;

revoke all on function upsert_highscore(text, int) from public;
grant execute on function upsert_highscore(text, int) to authenticated;
