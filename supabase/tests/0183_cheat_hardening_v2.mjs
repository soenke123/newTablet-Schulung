/* Prüfstand für Migration 0183 — Cheat-Härtung v2. Echt gerechnet in pglite.

   Zusagen:
     1. authenticated darf kein Profil mehr anlegen (kein Selbst-Admin).
     2. authenticated darf user_collectibles nicht mehr direkt schreiben.
     3. upsert_highscore: Spiel ohne Bestenliste → no_leaderboard + Flag.
     4. upsert_highscore: Score über Cap → abgelehnt + Flag; darunter ok.
     5. sync_shop_state: Kristalle über Tagesbudget werden gekappt + Flag.
     6. sync_shop_state: bankedCoins-Pumpen wird gekappt.
     7. sync_shop_state: Item-Zähler über Budget werden gekappt.
     8. sync_shop_state: Kristall-Tausch mit gedeckten Münzen geht durch.
     9. sync_shop_state: Nest freilassen (Umbuchung Nest → Bank) belastet
        das Budget nicht.
    10. Ehrlicher kleiner Zuwachs bleibt unangetastet und ohne Flag.
    11. Flags werden entprellt (kein Fluten bei wiederholtem Push).

   Aufruf:  node supabase/tests/0183_cheat_hardening_v2.mjs  */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MIG = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
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
const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(join(MIG, f), 'utf8');

await run(STUBS, 'Stubs');
await run(mig('0001_init.sql'), '0001');
await run(mig('0002_rls.sql'), '0002');
await run(`
  alter table profiles  add column if not exists is_superadmin boolean not null default false;
  alter table game_state add column if not exists coins int not null default 0;
  create or replace function is_superadmin() returns boolean language sql stable as $$
    select coalesce((select is_superadmin from profiles where id = auth.uid()), false) $$;
`, 'Spalten aus späteren Migrationen');
await run(mig('0016_cheat_hardening_light.sql'), '0016');
await run(mig('0019_highscores.sql'), '0019');
await run(mig('0059_released_nest_tombstones.sql'), '0059');
await run(mig('0183_cheat_hardening_v2.sql'), '0183');
console.log('— Migrationen laufen durch —\n');

const SCHOOL  = 'd0000000-0000-4000-8000-000000000001';
const CLUSTER = 'c0000000-0000-4000-8000-000000000001';
const U1 = 'e0000000-0000-4000-8000-000000000001'; // Cheater
const U2 = 'e0000000-0000-4000-8000-000000000002'; // ehrlich
const U3 = 'e0000000-0000-4000-8000-000000000003'; // frischer Auth-User ohne Profil

await run(`
  insert into schools (id, slug, name) values ('${SCHOOL}','mps','MPS');
  insert into clusters (id, school_id, name, season) values ('${CLUSTER}','${SCHOOL}','K1', 3);
  insert into auth.users (id) values ('${U1}'), ('${U2}'), ('${U3}');
  insert into profiles (id, school_id, cluster_id, account_name, display_name, status) values
    ('${U1}','${SCHOOL}','${CLUSTER}','cheater','helium','active'),
    ('${U2}','${SCHOOL}','${CLUSTER}','ehrlich','Ehrlich','active');
  insert into games (id, season, folder, active) values
    ('game3', 1, 'S1 DateiformatQuiz', true),
    ('game9', 1, 'S1 Fokusflow', true),
    ('game12', 2, 'S2 Quellen Tinder', true);
`, 'Bühne');
// 0183 wurde vor den Spielen eingespielt → Caps jetzt nachziehen wie auf Prod
await run(mig('0183_cheat_hardening_v2.sql'), '0183 (idempotent, 2. Lauf)');

const as = async (uid, fn) => {
  await db.exec(`delete from _who; insert into _who values ('${uid}');`);
  return fn();
};
const asRole = async (uid, sql) => {
  await db.exec(`delete from _who; insert into _who values ('${uid}');`);
  await db.exec('set role authenticated');
  try { await db.exec(sql); return null; }
  catch (e) { return e.message; }
  finally { await db.exec('reset role'); }
};
const flags = async (uid, reason) =>
  Number((await one(`select count(*) c from cheat_flags where user_id=$1 and reason=$2`, [uid, reason])).c);
const shop = async uid =>
  (await one(`select value v from user_collectibles where user_id=$1 and key='shop_state'`, [uid]))?.v ?? {};
const sync = async (uid, state) =>
  as(uid, async () => (await one(`select sync_shop_state($1::jsonb) r`, [JSON.stringify(state)])).r);

/* 1 + 2: Rechte */
{
  const err = await asRole(U3, `insert into profiles (id, school_id, account_name, display_name, status, is_admin, is_superadmin)
                                values ('${U3}','${SCHOOL}','boese','boese','active',true,true)`);
  ok('1  Selbst-Profil mit is_superadmin wird abgelehnt', err && /permission denied/.test(err), err || 'kein Fehler!');

  const err2 = await asRole(U1, `insert into user_collectibles (user_id, key, value) values ('${U1}','shop_state','{"kristalle":9999}')`);
  ok('2a user_collectibles INSERT abgelehnt', err2 && /permission denied/.test(err2), err2 || 'kein Fehler!');
  const err3 = await asRole(U1, `update user_collectibles set value='{}' where user_id='${U1}'`);
  ok('2b user_collectibles UPDATE abgelehnt', err3 && /permission denied/.test(err3), err3 || 'kein Fehler!');
}

/* 3 + 4: Highscores */
{
  const r1 = await as(U1, async () => (await one(`select upsert_highscore('game3', 999999) r`)).r);
  ok('3  game3 (keine Bestenliste) → no_leaderboard', r1.error === 'no_leaderboard', JSON.stringify(r1));
  ok('3b Flag highscore_no_board geloggt', await flags(U1, 'highscore_no_board') === 1);

  const r2 = await as(U1, async () => (await one(`select upsert_highscore('game9', 999999999) r`)).r);
  ok('4a game9 über Cap → score_out_of_range', r2.error === 'score_out_of_range', JSON.stringify(r2));
  ok('4b Flag highscore_cap geloggt', await flags(U1, 'highscore_cap') === 1);
  const r3 = await as(U2, async () => (await one(`select upsert_highscore('game9', 1275) r`)).r);
  ok('4c ehrlicher game9-Score 1275 geht durch', r3.ok === true && r3.best_score === 1275, JSON.stringify(r3));
}

/* 5–7: Shop-Pumpen wie im echten Fall (906 💎, 95 600 🪙, 30+ Items) */
{
  const r = await sync(U1, {
    kristalle: 906, spentKristalle: 64, bankedCoins: 95600, spentCoins: 0,
    wachstumstrankCount: 34, wachstumsBoosterCount: 32, coinsx3Count: 44, gluckskleeCount: 47,
    nests: []
  });
  ok('5–7 sync ok', r.ok === true, JSON.stringify(r).slice(0, 120));
  const s = await shop(U1);
  ok('5  Kristalle auf Tagesbudget 300 gekappt', s.kristalle === 300, `kristalle=${s.kristalle}`);
  ok('6  bankedCoins auf 3000 gekappt', s.bankedCoins === 3000, `bankedCoins=${s.bankedCoins}`);
  const items = s.wachstumstrankCount + s.wachstumsBoosterCount + s.coinsx3Count + s.gluckskleeCount;
  ok('7  Items insgesamt auf 40 gekappt', items === 40, `items=${items}`);
  ok('5b Flag shop_budget geloggt', await flags(U1, 'shop_budget') === 1);

  // Zweiter Versuch am selben Tag: Budget ist aufgebraucht → nichts mehr
  await sync(U1, { kristalle: 5000, bankedCoins: 99999, spentCoins: 0, nests: [] });
  const s2 = await shop(U1);
  ok('5c Zweiter Pump am selben Tag bringt nichts', s2.kristalle === 300 && s2.bankedCoins === 3000,
     `kristalle=${s2.kristalle} bank=${s2.bankedCoins}`);
  ok('11 Flag entprellt (weiterhin 1)', await flags(U1, 'shop_budget') === 1);

  // Nest-Münzen pumpen
  await db.exec(`update shop_daily_gains set coin_sources = 0 where user_id = '${U1}'`);
  await sync(U1, { bankedCoins: 3000, nests: [
    { nestId: 'nest_x', eggType: 'rare', hatched: { creature: 'ente', growth: 0, points: 0, roundsPlayed: 0, coins: 100000 } }
  ] });
  const s3 = await shop(U1);
  ok('6b Nest-Münzen auf Budget gekappt', s3.nests?.[0]?.hatched?.coins === 3000,
     `nest coins=${s3.nests?.[0]?.hatched?.coins}`);
}

/* 8–10: ehrlicher Spieler */
{
  await db.exec(`insert into game_state (user_id, game_id, points, coins) values ('${U2}','game9', 50, 400)`);
  const r0 = await sync(U2, { kristalle: 2, bankedCoins: 10, spentCoins: 0, wachstumstrankCount: 1, nests: [] });
  const s0 = await shop(U2);
  ok('10 Lootbox-Kleinkram bleibt stehen', r0.ok && s0.kristalle === 2 && s0.bankedCoins === 10 && s0.wachstumstrankCount === 1,
     JSON.stringify({ k: s0.kristalle, b: s0.bankedCoins, w: s0.wachstumstrankCount }));
  ok('10b kein Flag für ehrlichen Spieler', await flags(U2, 'shop_budget') === 0);

  // Budget künstlich ausschöpfen, dann Kristalle mit Münzen kaufen: 3× (60 🪙 → 10 💎)
  await db.exec(`update shop_daily_gains set kristalle = 300, items = 40 where user_id = '${U2}'`);
  await sync(U2, { kristalle: 32, bankedCoins: 10, spentCoins: 180, wachstumstrankCount: 1, nests: [] });
  const s1 = await shop(U2);
  ok('8  Kristall-Tausch mit gedeckten Münzen geht durch', s1.kristalle === 32, `kristalle=${s1.kristalle}`);

  // Ohne Deckung: spentCoins weit über dem Bestand → Kristalle gekappt
  await sync(U2, { kristalle: 2032, bankedCoins: 10, spentCoins: 100000, nests: [] });
  const s1b = await shop(U2);
  ok('8b Tausch ohne Münzdeckung wird gekappt', s1b.kristalle < 200, `kristalle=${s1b.kristalle}`);

  // Nest freilassen: Nest (500 🪙) verschwindet (Tombstone), Bank +500
  await db.exec(`update shop_daily_gains set coin_sources = 3000 where user_id = '${U2}'`);
  await db.exec(`update user_collectibles set value = jsonb_set(value, '{nests}',
    '[{"nestId":"nest_a","eggType":"rare","gameId":null,"gameUrl":null,"hatched":{"creature":"ente","growth":5,"points":5,"roundsPlayed":1,"coins":500}}]')
    where user_id = '${U2}' and key = 'shop_state'`);
  const bankBefore = (await shop(U2)).bankedCoins;
  await sync(U2, { bankedCoins: bankBefore + 500, spentCoins: 100000, kristalle: 2032,
                   nests: [], releasedNestIds: ['nest_a'] });
  const s2 = await shop(U2);
  ok('9  Freilassen (Nest → Bank) geht trotz vollem Budget durch', s2.bankedCoins === bankBefore + 500,
     `bank=${s2.bankedCoins} erwartet=${bankBefore + 500}, nests=${JSON.stringify(s2.nests)}`);
}

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
