-- ═══════════════════════════════════════════════════════════════
-- 0127 · Kingdoms of Mathoria — PvE: der Gegner wird ein Gegner
-- ═══════════════════════════════════════════════════════════════
--
-- Nach der ersten echten Stunde mit 0126: die Bots sind harmlos. Nicht
-- weil die Richtzeiten falsch wären — die stimmen — sondern weil zwei
-- Regeln sie gegenseitig aufheben.
--
-- ── Was 0126 falsch gebaut hat ─────────────────────────────────
-- Die Ramp hebt die Stufe je gehaltener Klassen-Burg. Die Rüstung
-- (clash_ai_armor) hing an GENAU DERSELBEN Burg und galt für ALLE
-- Klassenfelder gleichzeitig. Jede Burg gab dem Computer also Tempo und
-- nahm ihm im selben Atemzug einen ganzen Treffer je Feld.
--
-- Ausgespielt (2 Mio. Züge je Zeile), in eroberten Feldern je Richtzeit
-- eines starken Kindes. Zum Vergleich: ein starkes Kind mit 90 % Quote
-- und der Serie bei 4 kommt auf 1,282.
--
--     Burgen  Stufe  Rüstung   0126     0127    % vom Kind
--        1      1       0      0,202    0,392      31 %
--        2      2       1      0,123    0,470      37 %
--        4      4       3      0,095    0,696      54 %
--        7      7       3      0,211    1,455     114 %
--
-- Die Ramp war netto eine AB-Rampe: der Gegner wurde im Verlauf der
-- Partie schwächer, am schwächsten ausgerechnet in der Mitte. Genau das
-- Gefühl, das er hinterlassen hat.
--
-- Dass Stufe 7 über 100 % liegt, ist Absicht: es sind so viele Bots wie
-- Kinder, und in einer Klasse ist nicht jedes Kind ein starkes.
--
-- ── Drei Änderungen ────────────────────────────────────────────
--
-- 1. Die Stufen werden schärfer (clash_ai_levels):
--        Stufe 1 — 2,5-fache Zeit eines starken Kindes, 75 % richtig
--        Stufe 7 — 1,0-fache Zeit,                      98 % richtig
--    Die Ramp bleibt, wie sie ist: eine Burg, eine Stufe. Sie ist jetzt
--    ein echter Anstieg, weil ihr Gegengewicht nicht mehr mitwächst.
--
-- 2. Die Bot-Serie zündet bei 4 statt bei 10 — dieselbe Schwelle wie
--    beim Kind (clash_streak_goals.solo). Bei 10 und einer Quote um 80 %
--    kam sie praktisch nie zustande (0,8^10 = 0,11); der Bot hatte die
--    Regel auf dem Papier und nie im Spiel. Bei 4 trägt sie auf Stufe 7
--    fast die Hälfte der Ausbeute — und zwar dann, wenn eine Serie
--    tatsächlich läuft, was auf dem Beamer zu sehen ist.
--
-- 3. Die Rüstung wird zu HERZEN AUF FELDERN. Nicht mehr „alle eure
--    Felder halten N Treffer mehr aus", sondern: jede eroberte
--    Computer-Burg legt einmalig acht Herzen auf zufällige Klassenfelder.
--    Ein Treffer nimmt ein Herz, das Feld bleibt. Sind die Herzen weg,
--    sind sie weg.
--
--    Der Unterschied ist nicht kosmetisch. Die alte Rüstung war ein
--    Faktor auf ALLES (÷4 bei drei Rüstung) und wuchs mit dem eigenen
--    Erfolg; die Herzen sind ein fester Vorrat von acht Treffern, der
--    sich verbraucht. Ein Polster, kein Multiplikator — und das Feld
--    zeigt, wo es liegt.
--
-- Nebenbei: die Klassenfläche endet bei 12 statt bei 16 Feldern
-- (clash_pve_tiles). 16 war zu viel Vorrat für einen Gegner, der sich
-- nicht durchbeißen konnte; mit einem, der es kann, ist es zu viel Feld.
--
-- ── Warum die Herzen in clash_capture_apply vergeben werden ─────
-- Naheliegend wäre clash_ai_tick — der läuft ohnehin und sieht den
-- Spielstand. Er sieht aber nur ZUSTÄNDE, keine Ereignisse: um „eine
-- Burg ist gerade gefallen" zu erkennen, bräuchte er einen Zähler am
-- Board, und der müsste in clash_room_start und clash_room_reset
-- zurückgesetzt werden (zwei große Funktionen, die sonst niemand
-- anfasst — jede Neu-Deklaration ist eine Gelegenheit, einen
-- Zwischen-Fix zu verlieren, siehe feedback_shop_state_merge_regressions).
--
-- clash_capture_apply ist die Stelle, an der eine Burg fällt. Dort ist
-- das Ereignis kein Vergleich, sondern eine Tatsache, und der Zähler
-- entfällt ersatzlos. Zurückgesetzt wird auch nichts: Start und Reset
-- löschen clash_tiles, und die Herzen stehen in clash_tiles.
--
-- ── Was mit clash_ai_armor passiert ────────────────────────────
-- Die Funktion bleibt, ihre Rechnung wird eine andere: nicht mehr die
-- SCHWELLE (Burgen − 1), sondern die Summe der noch liegenden Herzen.
-- Dadurch bleiben clash_view und clash_room_get unangetastet — sie
-- rufen sie auf, füllen damit ai.armor, und der Client zeigt dort schon
-- heute einen Schild mit einer Zahl. Zwei Funktionen mit je 200 Zeilen
-- nicht anzufassen ist den umgedeuteten Namen wert.
--
-- ⚠️ Neu deklariert werden clash_ai_levels/clash_pve_tiles/clash_ai_armor/
-- clash_ai_tick/clash_tiles_json/clash_sig_of/clash_capture_apply —
-- jeweils die HÖCHSTE bestehende Fassung (alle 0126).
-- clash_ai_capture (0126) wird NICHT mehr gerufen und bleibt unberührt
-- stehen; ihr Nachfolger clash_ai_strike hat eine andere Signatur, weil
-- die Schwelle als Parameter weggefallen ist.
--
-- Kein DROP: `add column if not exists`, `create or replace`
-- (Regel: feedback_supabase_no_drop_statements).
--
-- Client-Anpassung: ja (tool.js/tool.css) ⇒ Cache-Stempel.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_tiles.armor — die Herzen liegen auf dem Feld
-- ─────────────────────────────────────────────────────────────
-- Der Gegenentwurf zu armor_hits (0126). Dort stand je Feld, wie oft
-- schon getroffen wurde, und die Schwelle kam von außen; hier steht am
-- Feld, was es noch aushält. Das ist dieselbe Information von der
-- nützlicheren Seite: der Client kann sie direkt zeichnen, ohne eine
-- zweite Zahl für die ganze Karte zu kennen, und ein Feld verliert seine
-- Herzen nicht, wenn anderswo eine Burg den Besitzer wechselt.
--
-- armor_hits bleibt als Spalte stehen (kein DROP) und wird ab hier von
-- niemandem mehr gelesen oder geschrieben.
alter table clash_tiles
  add column if not exists armor int not null default 0;

comment on column clash_tiles.armor is
  'Herzen auf diesem Feld (0127, nur PvE). Jeder Treffer des Computers nimmt eines weg, statt den '
  'Besitzer zu wechseln; bei 0 fällt das Feld. Vergeben werden sie in Achterpaketen je eroberter '
  'Computer-Burg (clash_capture_apply). Burgen bekommen keine — die haben ihre eigenen drei Leben. '
  'Löst clash_tiles.armor_hits (0126) ab, das ab 0127 unbenutzt ist.';

comment on column clash_tiles.armor_hits is
  'ABGELÖST durch clash_tiles.armor (0127). Stand in 0126 für die Zahl der kassierten Treffer '
  'gegen eine für die ganze Karte geltende Schwelle. Wird nicht mehr gelesen und nicht mehr '
  'geschrieben; bleibt nur stehen, weil Migrationen hier nichts fallen lassen.';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_ai_levels — die neuen Stufen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0126. Beide Reihen laufen weiterhin linear zwischen den
-- beiden Ankern, die Anker selbst sind neu:
--   Stufe 1 — 2,50-fache Zeit eines starken Kindes, 75 % richtig
--   Stufe 7 — 1,00-fache Zeit,                      98 % richtig
--
-- Stufe 7 heißt jetzt wörtlich: der Bot ist so schnell wie ein starkes
-- Kind und macht fast keine Fehler. Zusammen mit der Serie bei 4 liegt
-- er damit knapp ÜBER einem starken Kind — das ist Absicht. Es sind so
-- viele Bots wie Kinder, und in einer Klasse ist nicht jedes Kind stark.
--
-- armor_cap ist weg (es gibt keine Schwelle mehr, die zu deckeln wäre),
-- an seine Stelle tritt heart_grant.
create or replace function clash_ai_levels()
  returns jsonb
  language sql
  immutable
as $$
  select jsonb_build_object(
    -- Vielfaches der Kind-Richtzeit, Index 0 = Stufe 1
    'time_factor',  jsonb_build_array(2.50, 2.25, 2.00, 1.75, 1.50, 1.25, 1.00),
    -- Trefferquote je Antwort
    'quote',        jsonb_build_array(0.75, 0.79, 0.83, 0.87, 0.90, 0.94, 0.98),
    -- ± dieser Anteil auf den Takt jedes einzelnen Bots
    'variance',     0.10,
    -- Treffer in Folge für den Bot-Bonus — seit 0127 dieselbe Schwelle
    -- wie beim Kind (clash_streak_goals.solo)
    'bot_streak',   4,
    -- … und wie viele Felder er bringt
    'bot_reward',   2,
    -- Herzen je eroberter Computer-Burg (0127)
    'heart_grant',  8
  );
$$;

comment on function clash_ai_levels() is
  'Die Zahlen des Computer-Gegners, an einem Ort (0126, neu gefasst in 0127): time_factor und '
  'quote je Stufe 1–7 (Index 0 = Stufe 1, Stufe 1 = 2,50×/75 %, Stufe 7 = 1,00×/98 %), variance '
  'als Streuung des einzelnen Bot-Takts, bot_streak/bot_reward für die Serie des Bots (4/2 wie '
  'beim Kind), heart_grant für die Herzen je eroberter Burg. Wird an beide Ansichten '
  'durchgereicht, damit die Lobby die Stufen beschreiben kann, ohne die Zahlen zu doppeln.';

grant execute on function clash_ai_levels() to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) clash_pve_tiles — 12 statt 16 als Obergrenze
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0126, andere Steigung. 8 Felder bis 12 Kinder, dann linear
-- bis 12 Felder bei 24 Kindern, darüber gleichbleibend.
--
-- `round(n/3 + 4)` trifft beide Anker exakt (12 → 8, 24 → 12). Die
-- Klammern davor und danach halten die Ränder, damit eine leere Lobby
-- nicht mit vier Feldern startet.
--
-- Warum überhaupt kleiner: mit den Stufen von 0126 kam der Computer nie
-- durch die Rüstung, da war viel eigenes Feld nur Wartezeit. Mit einem
-- Gegner, der sich durchbeißt, ist dieselbe Fläche eine echte Reserve —
-- und dann sind 16 zu viel davon.
create or replace function clash_pve_tiles(p_players int)
  returns int
  language sql
  immutable
as $$
  select least(12, greatest(8, round(coalesce(p_players, 0) / 3.0 + 4)::int));
$$;

comment on function clash_pve_tiles(int) is
  'Startfelder des Klassen-Volks im PvE (0126, Obergrenze in 0127 von 16 auf 12 gesenkt): 8 bis '
  '12 Kinder, linear bis 12 Felder bei 24 Kindern, darüber gleichbleibend. Der Computer bekommt '
  'das ai_level-fache davon.';

grant execute on function clash_pve_tiles(int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) clash_ai_armor — umgedeutet: wie viele Herzen liegen noch?
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0126, andere Rechnung, gleiche Signatur. Bis 0126 war das
-- die Schwelle, die JEDES Klassenfeld aushielt; seit 0127 ist es der
-- Vorrat, der insgesamt noch auf der Karte liegt.
--
-- Die Signatur bleibt, weil clash_view und clash_room_get sie aufrufen
-- und ihr Ergebnis als ai.armor an die Tablets geben — dort steht es im
-- Schild-Abzeichen am Kopf. Aus „eure Felder halten 3 Treffer mehr aus"
-- wird „ihr habt noch 11 Herzen liegen". Dieselbe Zahl an derselben
-- Stelle, und beide Ansichten bleiben unangetastet.
create or replace function clash_ai_armor(p_room uuid)
  returns int
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce((select sum(armor)::int
                     from clash_tiles
                    where room_id = p_room and owner_team = 0), 0);
$$;

revoke all on function clash_ai_armor(uuid) from public;

comment on function clash_ai_armor(uuid) is
  'Wie viele Herzen im PvE noch auf den Feldern der Klasse liegen (0126, in 0127 von der SCHWELLE '
  'zum VORRAT umgedeutet). Füllt ai.armor in clash_view/clash_room_get und damit das '
  'Schild-Abzeichen am Kopf des Tablets.';


-- ─────────────────────────────────────────────────────────────
-- 5) clash_pve_grant_hearts — acht Herzen verteilen
-- ─────────────────────────────────────────────────────────────
-- `order by armor asc, random()` statt bloßem `random()`: erst bekommt
-- jedes Feld eines, dann erst das zweite. Bei acht Herzen und zwölf
-- Feldern liegt sonst schnell ein Stapel von drei auf einer Kachel,
-- während daneben eine ungeschützt fällt — und die Klasse sieht acht
-- Herzen auf drei Feldern und hält es für einen Fehler.
--
-- Burgen sind ausgenommen: sie haben ihre eigenen drei Leben (0100),
-- und ein Herz obendrauf würde die Rechnung „drei Treffer, dann fällt
-- sie" unsichtbar verschieben.
--
-- Hat die Klasse weniger als acht gewöhnliche Felder, stapelt es sich
-- doch — das ist richtig so: der Vorrat gehört ihr, nicht der Fläche.
-- Der Deckel bei 9 ist derselbe wie im Client und eine Notbremse, keine
-- Spielregel.
create or replace function clash_pve_grant_hearts(p_room uuid, p_n int)
  returns int
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_left int := greatest(coalesce(p_n, 0), 0);
  v_hit  int := 0;
  v_take int;
begin
  while v_left > 0 loop
    -- Eine Runde reihum: höchstens ein Herz je Feld, damit die Verteilung
    -- flach bleibt. Mehr Felder als Herzen ⇒ genau eine Runde.
    with ziel as (
      select ctid
        from clash_tiles
       where room_id = p_room
         and owner_team = 0
         and not is_castle
         and armor < 9
       order by armor asc, random()
       limit v_left
    )
    update clash_tiles t
       set armor = t.armor + 1, updated_at = now()
      from ziel z
     where t.ctid = z.ctid;

    get diagnostics v_take = row_count;
    exit when v_take = 0;          -- kein Feld mehr frei: Rest verfällt

    v_left := v_left - v_take;
    v_hit  := v_hit + v_take;
  end loop;

  return v_hit;
end;
$$;

revoke all on function clash_pve_grant_hearts(uuid, int) from public;

comment on function clash_pve_grant_hearts(uuid, int) is
  'Legt p_n Herzen auf zufällige gewöhnliche Felder des Klassen-Volks (0127), reihum je eines, '
  'damit sie sich flach verteilen statt zu stapeln. Burgen bleiben aussen vor, je Feld höchstens '
  '9. Gerufen aus clash_capture_apply, sobald eine Computer-Burg fällt. Liefert die Zahl der '
  'tatsächlich vergebenen Herzen.';


-- ─────────────────────────────────────────────────────────────
-- 6) clash_ai_strike — der Angriff eines Bots
-- ─────────────────────────────────────────────────────────────
-- Nachfolger von clash_ai_capture (0126). Die Schwelle als Parameter
-- ist weg, weil die Herzen am Feld hängen; damit ändert sich die
-- Signatur und die alte Funktion bleibt unberührt stehen.
--
-- Zwei Unterschiede zu 0126, beide bewusst:
--
-- Erstens fällt das `order by (armor_hits > 0) desc` weg. Es war
-- Lesbarkeit — der Computer sollte sichtbar EIN Feld aufbrechen statt
-- überall gleichzeitig zu kratzen. Mit Herzen auf einzelnen Feldern
-- erzählt sich das von selbst, und die alte Regel wäre jetzt schädlich:
-- sie hieße „schlag immer dorthin, wo ein Herz liegt", und acht Herzen
-- wären in acht Zügen weg, ohne je ein Feld geschützt zu haben. Rein
-- zufällig zu treffen ist genau der Sinn von „acht ZUFÄLLIGE Felder".
--
-- Zweitens greift die Prüfung nicht mehr auf eine von außen gereichte
-- Zahl zurück, sondern auf das Feld selbst — ein Zug kann damit nicht
-- mehr mit einem veralteten Rüstungsstand rechnen.
create or replace function clash_ai_strike(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_tr     int;
  v_tc     int;
  v_castle boolean;
  v_armor  int;
  i        int;
begin
  -- Drei Anläufe wie seit 0106: eine gerade gesperrte Zeile ist kein
  -- „kein Feld da".
  for i in 1..3 loop
    v_tr := null; v_tc := null;
    select t.r, t.c, t.is_castle, t.armor
      into v_tr, v_tc, v_castle, v_armor
      from clash_tiles t
     where t.room_id = p_room
       and t.owner_team = 0
       and exists (
         select 1 from clash_tiles m
          where m.room_id = t.room_id
            and m.owner_team = 1
            and clash_is_neighbor(m.r, m.c, t.r, t.c)
       )
     order by random()
     limit 1
       for update of t skip locked;
    exit when v_tr is not null;
  end loop;

  if v_tr is null then
    return jsonb_build_object('captured', null, 'castle_hit', null, 'armor_hit', null);
  end if;

  -- Ein Herz fängt den Treffer ab. Burgen haben keine (clash_pve_grant_
  -- hearts lässt sie aus), die Bedingung ist dort also nie wahr — sie
  -- steht trotzdem da, damit ein späterer Griff an die Vergabe nicht
  -- versehentlich Burgen unsterblich macht.
  if not v_castle and coalesce(v_armor, 0) > 0 then
    update clash_tiles
       set armor = greatest(coalesce(armor, 0) - 1, 0), updated_at = now()
     where room_id = p_room and r = v_tr and c = v_tc;

    return jsonb_build_object(
      'captured', null, 'castle_hit', null,
      'armor_hit', jsonb_build_object('r', v_tr, 'c', v_tc,
                                      'left', greatest(coalesce(v_armor, 0) - 1, 0)));
  end if;

  return clash_capture_apply(p_room, 1, v_tr, v_tc) || jsonb_build_object('armor_hit', null);
end;
$$;

revoke all on function clash_ai_strike(uuid) from public;

comment on function clash_ai_strike(uuid) is
  'Ein Angriff des Computers im PvE (0127, Nachfolger von clash_ai_capture): lost ein an ihn '
  'grenzendes Feld der Klasse aus — rein zufällig, ohne Vorliebe. Liegt dort ein Herz, verliert '
  'das Feld es und bleibt; sonst gilt clash_capture_apply wie immer.';


-- ─────────────────────────────────────────────────────────────
-- 7) clash_capture_apply — hier fällt die Burg, hier kommen die Herzen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0126. Zwei Änderungen:
--
--   • `armor_hits = 0` wird zu `armor = 0`: die Herzen gehören dem
--     BESITZER, nicht dem Feld. Holt die Klasse ein Feld zurück, kommt
--     es nackt zurück — und der Computer erbt nie ein Herz.
--
--   • Fällt eine Burg an die Klasse, werden acht Herzen verteilt. Der
--     Test ist eng gefasst: nur im PvE, nur wenn die KLASSE (Team 0)
--     eine Burg erobert, und nur beim tatsächlichen Besitzerwechsel —
--     ein Burg-Treffer, der bloß ein Leben kostet, kommt oben im
--     castle_hit-Zweig gar nicht bis hierher.
--
-- Der Modus-Test ist eine eigene Abfrage statt eines Parameters, weil
-- clash_capture_apply aus fünf Stellen gerufen wird (clash_submit,
-- clash_pick_tile, clash_ai_strike, …) und keine davon etwas vom
-- Spielmodus wissen muss. Eine Indexsuche auf dem Primärschlüssel je
-- Eroberung ist dafür ein fairer Preis.
create or replace function clash_capture_apply(p_room uuid, p_team int, p_r int, p_c int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_tprev  int;
  v_castle boolean;
  v_hp     int;
  v_grant  int;
begin
  select owner_team, is_castle, castle_hp
    into v_tprev, v_castle, v_hp
    from clash_tiles
   where room_id = p_room and r = p_r and c = p_c
     for update;

  if v_tprev is null then
    return jsonb_build_object('captured', null, 'castle_hit', null);
  end if;

  if v_castle and coalesce(v_hp, 3) > 1 then
    update clash_tiles
       set castle_hp = castle_hp - 1, updated_at = now()
     where room_id = p_room and r = p_r and c = p_c;
    return jsonb_build_object('captured', null,
      'castle_hit', jsonb_build_object('r', p_r, 'c', p_c, 'hp', coalesce(v_hp, 3) - 1, 'owner', v_tprev));
  end if;

  update clash_tiles
     set owner_team = p_team, castle_hp = 3, armor = 0, updated_at = now()
   where room_id = p_room and r = p_r and c = p_c;

  -- 0127: eine eroberte Computer-Burg zahlt acht Herzen aus. Bewusst
  -- NACH dem Besitzerwechsel — sonst wäre die frisch eroberte Burg
  -- selbst noch ein Klassenfeld ohne Burg-Flagge und könnte eines
  -- abbekommen.
  if v_castle and p_team = 0 and v_tprev <> 0
     and (select mode from clash_boards where room_id = p_room) = 'pve' then
    v_grant := greatest(coalesce((clash_ai_levels()->>'heart_grant')::int, 8), 0);
    perform clash_pve_grant_hearts(p_room, v_grant);
  end if;

  return jsonb_build_object(
    'captured', jsonb_build_object('r', p_r, 'c', p_c, 'prev_owner', v_tprev, 'castle', v_castle, 'hp', 3),
    'castle_hit', null);
end;
$$;

revoke all on function clash_capture_apply(uuid, int, int, int) from public;

comment on function clash_capture_apply(uuid, int, int, int) is
  'Wendet eine Eroberung auf ein bereits geprüftes Feld an (0106): Burgen verlieren erst ein '
  'Leben, alle anderen Felder wechseln sofort den Besitzer. Seit 0126 setzt der Besitzerwechsel '
  'die Rüstung zurück (seit 0127 clash_tiles.armor) — sie gehört dem Besitzer, nicht dem Feld. '
  'Seit 0127 zahlt im PvE jede von der Klasse eroberte Computer-Burg heart_grant Herzen aus '
  '(clash_pve_grant_hearts).';


-- ─────────────────────────────────────────────────────────────
-- 8) clash_ai_tick — derselbe Herzschlag, ohne Schwelle
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0126, Wort für Wort. Geändert sind genau zwei Dinge: die
-- Schwellen-Variable ist weg, und aus clash_ai_capture(room, armor)
-- wird clash_ai_strike(room). Die neuen Stufenzahlen und die Serie bei
-- 4 kommen von selbst aus clash_ai_levels — dass hier dafür nichts zu
-- tun ist, war der Sinn der Tabelle.
create or replace function clash_ai_tick(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_board   clash_boards;
  v_lv      jsonb := clash_ai_levels();
  v_var     double precision;
  v_stage   int;
  v_factor  numeric;
  v_quote   double precision;
  v_beat    double precision;
  v_kids    int;
  v_castles int;
  v_goal    int;
  v_reward  int;
  v_bot     record;
  v_next    timestamptz;
  v_streak  int;
  v_correct int;
  v_moves   int;
  j         int;
begin
  select * into v_board from clash_boards where room_id = p_room;
  if v_board.room_id is null then return; end if;
  if v_board.mode <> 'pve' or v_board.phase <> 'running' then return; end if;

  -- Billiger Vorabtest, bevor überhaupt um die Sperre gebeten wird.
  if v_board.ai_ticked_at is not null
     and v_board.ai_ticked_at > now() - interval '500 milliseconds' then
    return;
  end if;

  if not pg_try_advisory_xact_lock(hashtext(p_room::text)) then
    return;
  end if;

  -- Zweite Lesung NACH der Sperre: wer sie eben noch hielt, hat
  -- inzwischen festgeschrieben, und in READ COMMITTED sieht dieses
  -- frische SELECT dessen ai_ticked_at. Ohne die Wiederholung liefe der
  -- Takt bei zwei fast gleichzeitigen Anfragen doppelt.
  select * into v_board from clash_boards where room_id = p_room;
  if v_board.mode <> 'pve' or v_board.phase <> 'running' then return; end if;
  if v_board.ai_ticked_at is not null
     and v_board.ai_ticked_at > now() - interval '500 milliseconds' then
    return;
  end if;

  -- ── Die Ramp ────────────────────────────────────────────────
  -- Unverändert seit 0126: eine Burg, eine Stufe, und greatest(…,
  -- ai_stage) ist die Ratsche — eine zurückeroberte Burg senkt die
  -- Stufe nicht wieder. Seit 0127 ist das ein echter Anstieg, weil ihr
  -- Gegengewicht (die alte Rüstung) nicht mehr mitwächst.
  select count(*)::int into v_castles
    from clash_tiles where room_id = p_room and owner_team = 0 and is_castle;

  v_stage := least(v_board.ai_level, greatest(v_board.ai_stage, greatest(v_castles, 1)));
  if v_stage <> v_board.ai_stage then
    update clash_boards set ai_stage = v_stage where room_id = p_room;
  end if;

  v_factor := (v_lv->'time_factor'->>(v_stage - 1))::numeric;
  v_quote  := (v_lv->'quote'->>(v_stage - 1))::double precision;
  v_var    := coalesce((v_lv->>'variance')::double precision, 0.1);
  v_goal   := greatest(coalesce((v_lv->>'bot_streak')::int, 4), 1);
  v_reward := greatest(coalesce((v_lv->>'bot_reward')::int, 2), 0);

  v_beat := greatest(coalesce(v_board.ai_pace_secs, 10) * coalesce(v_factor, 2), 1)::double precision;

  -- ── So viele Bots wie Kinder ────────────────────────────────
  -- Dieselbe Anwesenheitsgrenze wie 0079/0113/0121. Mindestens einer,
  -- damit eine Partie nicht stillsteht, während gerade alle Tablets im
  -- Sperrbildschirm sind.
  select count(*)::int into v_kids
    from clash_players pl
    join skill_participants p on p.id = pl.participant_id
   where p.room_id = p_room
     and pl.team_index = 0
     and p.left_at is null
     and not p.blocked
     and p.last_seen_at > now() - interval '90 seconds';
  v_kids := greatest(coalesce(v_kids, 0), 1);

  insert into clash_ai_bots (room_id, bot_no, next_at)
  select p_room, g, now() + make_interval(secs => v_beat)
    from generate_series(1, v_kids) g
   on conflict (room_id, bot_no) do nothing;

  delete from clash_ai_bots where room_id = p_room and bot_no > v_kids;

  -- ── Die fälligen Bots ───────────────────────────────────────
  for v_bot in
    select * from clash_ai_bots
     where room_id = p_room and next_at <= now()
     order by bot_no
       for update skip locked
  loop
    v_next    := v_bot.next_at;
    v_streak  := v_bot.streak;
    v_correct := v_bot.correct_count;

    -- Aufholen begrenzen. Wenn ein Raum eine Minute lang niemanden
    -- hatte, der pollt (Pause, Netz weg), stünden sonst zwölf Züge je
    -- Bot an und das halbe Feld fiele in einem einzigen Takt. Der
    -- Rückstand verfällt bewusst: der Computer spielt weiter, er holt
    -- nicht nach.
    if v_next < now() - make_interval(secs => v_beat * 3) then
      v_next := now() - make_interval(secs => v_beat * 0.5);
    end if;

    v_moves := 0;
    while v_next <= now() and v_moves < 2 loop
      if random() < v_quote then
        perform clash_ai_strike(p_room);
        v_streak  := v_streak + 1;
        v_correct := v_correct + 1;

        -- Die Serie des Bots — seit 0127 bei 4, dieselbe Schwelle wie
        -- die Einzel-Serie eines Kindes (clash_streak_goals.solo), nur
        -- ohne Auswahl: der Computer sucht sich nichts aus, er nimmt.
        if v_streak % v_goal = 0 then
          for j in 1 .. v_reward loop
            perform clash_ai_strike(p_room);
          end loop;
          perform clash_team_event_insert(p_room, 1, 'individual_fire',
            jsonb_build_object('name', 'Bot ' || v_bot.bot_no, 'streak', v_streak));
        end if;
      else
        v_streak := 0;
      end if;

      v_moves := v_moves + 1;
      -- ±variance je EINZELNEM Zug, nicht je Bot: sonst wäre ein Bot
      -- dauerhaft der schnelle und einer dauerhaft der lahme, und das
      -- Muster auf dem Feld wiederholte sich.
      v_next := v_next + make_interval(
        secs => v_beat * (1 - v_var + random() * 2 * v_var));
    end loop;

    update clash_ai_bots
       set next_at = v_next, streak = v_streak, correct_count = v_correct
     where room_id = p_room and bot_no = v_bot.bot_no;
  end loop;

  perform clash_check_win(p_room);

  update clash_boards set ai_ticked_at = now() where room_id = p_room;
end;
$$;

revoke all on function clash_ai_tick(uuid) from public;

comment on function clash_ai_tick(uuid) is
  'Der Takt des Computer-Gegners (0126, in 0127 auf clash_ai_strike umgestellt). Kein Cron: läuft '
  'lazy aus clash_submit/clash_view/clash_room_get, höchstens alle 500 ms und durch '
  'pg_try_advisory_xact_lock nie doppelt. Gleicht die Bot-Zahl den anwesenden Kindern an, führt '
  'die Ramp (ai_stage) nach und lässt jeden fälligen Bot bis zu zwei Züge machen. Steigt im PvP '
  'auf der ersten Zeile aus.';


-- ─────────────────────────────────────────────────────────────
-- 9) clash_tiles_json — Herzen statt Rissen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0126. `dmg` (Zahl der kassierten Treffer) wird zu `hearts`
-- (Zahl der noch liegenden Herzen). Das ist nicht dasselbe Feld mit
-- neuem Namen: `dmg` war ohne die für die ganze Karte geltende Schwelle
-- nicht zu lesen, `hearts` steht für sich. Der Client zeichnet daraus
-- direkt so viele Herzen, wie dort liegen.
create or replace function clash_tiles_json(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'r', r, 'c', c, 'team', owner_team, 'castle', is_castle,
           'hp', case when is_castle then castle_hp else null end,
           'hearts', coalesce(armor, 0)
         )), '[]'::jsonb)
    from clash_tiles where room_id = p_room;
$$;

comment on function clash_tiles_json(uuid) is
  'Das Spielfeld als JSON. Seit 0100 mit Burg-Leben (hp), seit 0127 mit hearts = Zahl der noch '
  'liegenden Herzen dieses Feldes (0 = keins). Ersetzt das dmg aus 0126, das ohne die damalige '
  'karteweite Schwelle nicht zu deuten war.';


-- ─────────────────────────────────────────────────────────────
-- 10) clash_sig_of — die Herzen in die Signatur
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0126, eine Zeile anders. Aus sum(armor_hits) wird
-- sum(armor), und der Grund ist derselbe wie damals: ein Treffer, der
-- nur ein Herz kostet, ändert sonst nichts, was die Signatur sieht —
-- max(updated_at) läuft zwar mit, aber sich darauf zu verlassen hieße,
-- die Sichtbarkeit eines Spielereignisses an eine Zeitauflösung zu
-- hängen.
--
-- Die Vergabe von acht Herzen fällt ohnehin auf (die Burg wechselt den
-- Besitzer), ihr VERBRAUCH aber nicht — und genau der ist das, was die
-- Klasse mitbekommen muss.
create or replace function clash_sig_of(p_room uuid)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select concat_ws('.',
    (select phase from clash_boards where room_id = p_room),
    (select team_count from clash_boards where room_id = p_room),
    (select factions::text from clash_boards where room_id = p_room),
    (select pool::text from clash_boards where room_id = p_room),
    (select coalesce(winner_team, -1) from clash_boards where room_id = p_room),
    (select count(*) from clash_tiles where room_id = p_room),
    (select coalesce(extract(epoch from max(updated_at))::bigint, 0)
       from clash_tiles where room_id = p_room),
    (select count(*) from skill_participants where room_id = p_room),
    (select count(*) from clash_preview_teams(p_room)),
    (select coalesce(shuffle_seed::text, '') from clash_boards where room_id = p_room),
    (select coalesce(extract(epoch from match_ends_at)::bigint, 0)
       from clash_boards where room_id = p_room),
    (select coalesce(sum(pl.correct_count), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room),
    -- 0106: Team-Serien-Vektor, Summe offener Picks, jüngstes Team-Ereignis.
    (select coalesce(string_agg(team_index::text || ':' || streak::text, ',' order by team_index), '')
       from clash_team_streaks where room_id = p_room),
    (select coalesce(sum(pl.pending_picks), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room),
    (select coalesce(max(id), 0) from clash_team_events where room_id = p_room),
    -- 0108: Ruinen-Punkte aller Völker.
    (select coalesce(sum(ruin_points), 0) from clash_team_streaks where room_id = p_room),
    -- 0126: Modus, eingestellte Stufe, Ramp-Stufe, Bot-Zahl.
    -- 0127: Summe der liegenden Herzen statt der kassierten Treffer.
    (select mode || ':' || ai_level::text || ':' || ai_stage::text
       from clash_boards where room_id = p_room),
    (select coalesce(sum(armor), 0) from clash_tiles where room_id = p_room),
    (select count(*) from clash_ai_bots where room_id = p_room)
  );
$$;

comment on function clash_sig_of(uuid) is
  'Billige Signatur des Raumzustands für den 8-Sekunden-Takt. Seit 0126 mit mode/ai_level/'
  'ai_stage und der Bot-Zahl, seit 0127 mit der Summe der liegenden Herzen — ohne die käme ein '
  'abgefangener Treffer oder ein Stufenaufstieg nicht zuverlässig auf den Tablets an.';
