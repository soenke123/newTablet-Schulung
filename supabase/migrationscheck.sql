-- ═══════════════════════════════════════════════════════════════
-- Migrations-Check für Wordisland (nur LESEN, ändert nichts)
-- ═══════════════════════════════════════════════════════════════
-- Im Supabase-Dashboard → SQL Editor einfügen und ausführen.
--
-- Warum es diese Datei gibt: Migrationen, die nur einen
-- Funktionsrumpf ersetzen (create or replace, gleiche Signatur),
-- sind von außen nicht erkennbar — die RPC-Schnittstelle sieht
-- vorher wie nachher gleich aus. Erkennbar sind sie nur an einem
-- Textstück IM Rumpf, und das liest pg_get_functiondef.
--
-- Die Spalte `status` sagt DRIN oder FEHLT. Eine Zeile mit FEHLT
-- ist die Antwort auf „warum verhält sich das Tablet anders als
-- der Beamer" — siehe die Spalte `woran man es merkt`.
-- ═══════════════════════════════════════════════════════════════

with def as (
  select p.proname,
         pg_get_functiondef(p.oid) as src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('wi_view', 'wi_answer', 'wi_teams_json',
                       'wi_solo_answer', 'wi_solo_create',
                       'wi_normalize_factions', 'wi_build_island')
),
spalte as (
  select c.relname as tab, a.attname as sp
    from pg_attribute a
    join pg_class c     on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
),
funk as (
  select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
pruef(nr, was, treffer, merkmal) as (
  values
    -- ── Die Arena-Kette ────────────────────────────────────────
    ('0133', 'factions/team_count in wi_boards',
     (select count(*) > 0 from spalte where tab = 'wi_boards' and sp = 'factions'),
     'ohne: Tablet malt stur Rot-Blau-Gruen-Gelb'),

    ('0134', 'wi_room_to_lobby',
     (select count(*) > 0 from funk where proname = 'wi_room_to_lobby'),
     'ohne: „Zurueck in die Lobby" startet sofort die naechste Runde'),

    ('0135', 'acht Voelker erlaubt',
     (select bool_or(src like '%[0-7]%') from def where proname = 'wi_normalize_factions'),
     'ohne: Voelker 7 und 8 werden vom Server abgelehnt'),

    ('0146', 'wi_shadow_strike + Ruinen',
     (select count(*) > 0 from funk where proname = 'wi_shadow_strike'),
     'ohne: keine Ruinen'),

    ('0148', 'Serien-Takt alle drei',
     (select bool_or(src like '%streak%3%' or src like '%wi_streak_goals%')
        from def where proname = 'wi_answer'),
     'ohne: Serie ab 3 statt alle 3'),

    ('0151', 'wi_streak_goals + Antwortsperre',
     (select count(*) > 0 from funk where proname = 'wi_streak_goals'),
     'ohne: im Auswahl-Modus derselbe Takt wie beim Tippen'),

    ('0152', 'blocked-Riegel in wi_view',
     (select bool_or(src like '%blocked%') from def where proname = 'wi_view'),
     'ohne: stillgelegte Tablets spielen weiter mit'),

    ('0157', 'sets_changed_at in wi_view',
     (select bool_or(src like '%sets_changed_at%') from def where proname = 'wi_view'),
     'ohne: Unit-Wechsel der Lehrkraft kommt nicht am Tablet an'),

    -- ⚠️ DIE WICHTIGSTE ZEILE ────────────────────────────────────
    ('0158a', 'factions in wi_view',
     (select bool_or(src like '%''factions''%') from def where proname = 'wi_view'),
     'ohne: FARBE am Tablet anders als am Beamer'),

    ('0158b', 'ruins/hearts in wi_view',
     (select bool_or(src like '%wi_heart_string%') from def where proname = 'wi_view'),
     'ohne: keine Ruinen und keine Herzen auf der Tablet-Karte'),

    ('0158c', 'shadow_pick in wi_view',
     (select bool_or(src like '%shadow_pick%') from def where proname = 'wi_view'),
     'ohne: Schattentempel-Nebelwahl verschwindet nach < 4 Sekunden'),

    ('0158d', 'correct in wi_teams_json',
     (select bool_or(src like '%''correct''%') from def where proname = 'wi_teams_json'),
     'ohne: Siegerbild ohne Wortzahl'),

    ('0165', 'Ruinen-Balance (Klo = 0 Herzen)',
     (select hearts_full = 0 from wi_ruin_def('klo')),
     'ohne: jede Ruine kostet einen Treffer mehr'),

    -- Erkennbar nur am Rumpf: die Signatur ist seit 0131 dieselbe.
    -- ⚠️ Gesucht wird `c_nebel`. Eine frueher verschickte, nie
    -- eingespielte Fassung von 0166 hatte statt dessen `c_groesse`
    -- und machte die Inseln GROESSER — die meldet hier FEHLT.
    ('0166', 'Inselgroesse aus dem Nebel-Anteil',
     (select bool_or(src like '%c_nebel%') from def where proname = 'wi_build_island'),
     'ohne: Insel rund dreimal zu gross, die Runde besteht nur aus Nebel'),

    ('0167', 'wi_room_set_end',
     (select count(*) > 0 from funk where proname = 'wi_room_set_end'),
     'ohne: Rundenende laesst sich nicht nachstellen (Fehlermeldung am Pult)'),

    -- ── Die eigene Insel ───────────────────────────────────────
    ('0136', 'wi_solo_learners',
     (select count(*) > 0 from spalte where tab = 'wi_solo_learners' and sp = 'token'),
     'ohne: keine eigene Insel'),

    ('0137', 'pgcrypto in extensions',
     (select bool_or(src like '%extensions%') from def where proname = 'wi_solo_create'),
     'ohne: Raumbeitritt wirft 42883'),

    ('0138', 'clean/helped in wi_solo_progress',
     (select count(*) > 0 from spalte where tab = 'wi_solo_progress' and sp = 'clean'),
     'ohne: das „i" beim Tier zeigt nur Nullen'),

    ('0139', 'Punkte + Beutel',
     (select count(*) > 0 from spalte where tab = 'wi_solo_learners' and sp = 'pass_no'),
     'ohne: alte Karteikasten-Waehrung'),

    ('0140', 'Beutel leert sich im Auswahl-Modus',
     (select bool_or(src like '%<> ''choice''%') from def where proname = 'wi_solo_answer'),
     'ohne: Runde wird im Auswahl-Modus nie fertig'),

    ('0141', 'pass_done (Prozentbalken)',
     (select count(*) > 0 from spalte where tab = 'wi_solo_learners' and sp = 'pass_done'),
     'ohne: Balken rechnet grob aus Woertern'),

    ('0142', 'wi_solo_unit',
     (select count(*) > 0 from funk where proname = 'wi_solo_unit'),
     'ohne: keine Unit-Leiste'),

    ('0145', 'wi_solo_level_history',
     (select count(*) > 0 from funk where proname = 'wi_solo_level_history'),
     'ohne: kein Level'),

    ('0147', 'wi_solo_today (Berlin)',
     (select count(*) > 0 from funk where proname = 'wi_solo_today'),
     'ohne: Tageswechsel um 2 Uhr statt um Mitternacht'),

    -- ── Inhalt ─────────────────────────────────────────────────
    ('0150', 'vocab_units',
     (select to_regclass('public.vocab_units') is not null),
     'ohne: keine Jahrgang-Unit-Station-Ordnung'),

    ('0153', 'wi_round_tally',
     (select count(*) > 0 from funk where proname = 'wi_round_tally'),
     'ohne: keine schweren Woerter nach der Runde'),

    ('0154', 'wi_set_words',
     (select count(*) > 0 from funk where proname = 'wi_set_words'),
     'ohne: Woerterliste einer Station nicht aufklappbar')
)
select nr,
       case when treffer then 'DRIN' else '>>> FEHLT <<<' end as status,
       was,
       case when treffer then '' else merkmal end as "woran man es merkt"
  from pruef
 order by nr;
