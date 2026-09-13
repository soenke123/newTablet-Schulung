/* Prüfstand für Migration 0144 — Tip Turbo Kids: Cheat-Scores raus,
   Server-Cap rein. Echt gerechnet in pglite.

   Fünf Zusagen:
     1. Vorhandene game11-Highscores > 1000 werden gelöscht.
     2. game11-Highscores <= 1000 bleiben stehen (kein Overkill-Delete).
     3. Highscores anderer Spiele bleiben unangetastet, auch wenn > 1000.
     4. upsert_highscore lehnt game11-Scores > 1000 ab (score_out_of_range)
        und ändert dabei nichts am bestehenden Best-Score.
     5. upsert_highscore nimmt game11-Scores <= 1000 weiterhin an, und
        andere Spiele sind vom neuen Cap nicht betroffen.

   Aufruf:  node supabase/tests/0144_tip_turbo_kids_score_cap.mjs  */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';

const ROOT = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const db = new PGlite({ extensions: { pgcrypto } });

const STUBS = `
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create role service_role; create role authenticated; create role anon;
`;

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;
const js  = v => JSON.stringify(v);

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint) console.error(`  Hinweis: ${e.hint}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(`${ROOT}/supabase/migrations/${f}`, 'utf8');

await run(STUBS, 'Stubs');
await run(mig('0001_init.sql'), '0001');
await run(mig('0019_highscores.sql'), '0019');
console.log('— 0001 + 0019 laufen durch —\n');

/* ── Bühne ──────────────────────────────────────────────────── */
const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const U1     = 'e0000000-0000-4000-8000-000000000001'; // hat gecheatet
const U2     = 'e0000000-0000-4000-8000-000000000002'; // ehrlicher Score
const U3     = 'e0000000-0000-4000-8000-000000000003'; // anderes Spiel, hoher Score

const CLUSTER = 'c0000000-0000-4000-8000-000000000001';

await db.exec(`
  insert into schools (id, slug, name) values ('${SCHOOL}','mps','MPS');
  insert into clusters (id, school_id, name, season) values ('${CLUSTER}','${SCHOOL}','Klasse 1', 1);
  insert into auth.users (id) values ('${U1}'), ('${U2}'), ('${U3}');
  insert into profiles (id, school_id, cluster_id, account_name, display_name, status) values
    ('${U1}','${SCHOOL}','${CLUSTER}','cheater','Cheater','active'),
    ('${U2}','${SCHOOL}','${CLUSTER}','ehrlich','Ehrlich','active'),
    ('${U3}','${SCHOOL}','${CLUSTER}','anderes','Anderes','active');
  insert into games (id, season, folder, active) values
    ('game11', 1, 'S1 10finger Blindschreiben', true),
    ('gameX',  1, 'irgendwas', true);

  insert into game_highscores (user_id, game_id, best_score) values
    ('${U1}', 'game11', 50000),
    ('${U2}', 'game11', 480),
    ('${U3}', 'gameX',  99999);
`);

/* ── jetzt 0144 ──────────────────────────────────────────────── */
console.log('— jetzt 0144 —\n');
await run(mig('0144_tip_turbo_kids_score_cap.sql'), '0144');

/* ── 1+2+3 · Datenbestand nach dem Delete ───────────────────── */
const rows = await all(`select user_id, game_id, best_score from game_highscores order by game_id, best_score`);
ok('1 · der Cheat-Score (game11, 50000) ist gelöscht',
   !rows.some(r => r.user_id === U1 && r.game_id === 'game11'), js(rows));
ok('2 · der ehrliche game11-Score (480) bleibt stehen',
   rows.some(r => r.user_id === U2 && r.game_id === 'game11' && r.best_score === 480));
ok('3 · der hohe Score eines anderen Spiels (gameX, 99999) bleibt unangetastet',
   rows.some(r => r.user_id === U3 && r.game_id === 'gameX' && r.best_score === 99999));

/* ── 4 · Server-Cap lehnt neue game11-Scores > 1000 ab ──────── */
await db.exec(`delete from _who; insert into _who (uid) values ('${U2}')`);
const zuHoch = (await one(`select upsert_highscore($1, $2) v`, ['game11', 1001])).v;
ok('4a · game11 mit 1001 wird abgelehnt', zuHoch.ok === false && zuHoch.error === 'score_out_of_range', js(zuHoch));
const nachAblehnung = await one(`select best_score from game_highscores where user_id = $1 and game_id = $2`, [U2, 'game11']);
ok('4b · der bestehende Best-Score bleibt bei 480 (nichts überschrieben)',
   nachAblehnung.best_score === 480, js(nachAblehnung));

/* ── 5 · Grenzfall genau 1000 geht, andere Spiele unbetroffen ─ */
const genau1000 = (await one(`select upsert_highscore($1, $2) v`, ['game11', 1000])).v;
ok('5a · game11 mit genau 1000 wird angenommen', genau1000.ok === true && genau1000.best_score === 1000, js(genau1000));

await db.exec(`delete from _who; insert into _who (uid) values ('${U3}')`);
const andereSpiele = (await one(`select upsert_highscore($1, $2) v`, ['gameX', 5000000])).v;
ok('5b · gameX ist vom game11-Cap nicht betroffen (5.000.000 > 1000 wird trotzdem angenommen)',
   andereSpiele.ok === true && andereSpiele.best_score === 5000000, js(andereSpiele));

/* ── 6 · Migration läuft zweimal ────────────────────────────── */
await run(mig('0144_tip_turbo_kids_score_cap.sql'), '0144 (zweites Mal)');
const nochmal = (await one(`select upsert_highscore($1, $2) v`, ['gameX', 6000000])).v;
ok('6 · die Migration läuft zweimal und die Funktion tut weiterhin ihren Dienst',
   nochmal.ok === true && nochmal.best_score === 6000000, js(nochmal));

console.log(fails ? `\n${fails} FEHLER\n` : '\nalles grün\n');
process.exit(fails ? 1 : 0);
