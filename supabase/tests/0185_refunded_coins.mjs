/* Prüfstand für Migration 0185 — Erstattungen als eigener Zähler. Echt gerechnet in pglite.

   Hintergrund: spentCoins wird per greatest() gemerged und kann nie sinken.
   Der Client rollte bei „Ei abbrechen" spentCoins lokal zurück; der Server
   verwarf das, wer zwischendurch erneut kaufte, baute eine Schuld auf.

   Zusagen:
     1. refundedCoins wird per max gemerged und überlebt Pushes ohne das Feld.
     2. Ein alter Client, der spentCoins senkt, senkt nichts (greatest bleibt).
     3. Erstattung ≤ spentCoins (kein Netto-Negativ-Hack).
     4. Erstattungs-Zuwachs belastet das Tagesbudget der Münz-Quellen.
     5. Die Münz-Deckung rechnet netto: Kauf-Abbruch-Kauf-Schleife flaggt nicht.
     6. Wirklich überzogene Ausgaben werden weiter geflaggt (netto).
     7. Reparatur per SQL (refundedCoins hochsetzen) hält gegen Client-Push
        und Items werden danach wieder nicht gekürzt.
     8. Die Migration ist wiederholbar (Umbenennung der Merge-Funktion).

   Aufruf:  node supabase/tests/0185_refunded_coins.mjs  */
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
await run(mig('0185_refunded_coins.sql'), '0185');
console.log('— Migrationen laufen durch —\n');

const SCHOOL  = 'd0000000-0000-4000-8000-000000000001';
const CLUSTER = 'c0000000-0000-4000-8000-000000000001';
const U1 = 'e0000000-0000-4000-8000-000000000001'; // Ei-Schleife
const U2 = 'e0000000-0000-4000-8000-000000000002'; // Erstattungs-Pumpe
const U3 = 'e0000000-0000-4000-8000-000000000003'; // Überzogen + Reparatur

await run(`
  insert into schools (id, slug, name) values ('${SCHOOL}','mps','MPS');
  insert into clusters (id, school_id, name, season) values ('${CLUSTER}','${SCHOOL}','K1', 3);
  insert into auth.users (id) values ('${U1}'), ('${U2}'), ('${U3}');
  insert into profiles (id, school_id, cluster_id, account_name, display_name, status) values
    ('${U1}','${SCHOOL}','${CLUSTER}','u1','U1','active'),
    ('${U2}','${SCHOOL}','${CLUSTER}','u2','U2','active'),
    ('${U3}','${SCHOOL}','${CLUSTER}','u3','U3','active');
  insert into games (id, season, folder, active) values ('game9', 1, 'S1 Fokusflow', true);
  insert into game_state (user_id, game_id, points, coins) values
    ('${U1}','game9', 50, 500),
    ('${U2}','game9', 50, 500),
    ('${U3}','game9', 50, 745);
`, 'Bühne');

const as = async (uid, fn) => {
  await db.exec(`delete from _who; insert into _who values ('${uid}');`);
  return fn();
};
const flags = async uid =>
  Number((await one(`select count(*) c from cheat_flags where user_id=$1 and reason='shop_budget'`, [uid])).c);
const shop = async uid =>
  (await one(`select value v from user_collectibles where user_id=$1 and key='shop_state'`, [uid]))?.v ?? {};
const sync = async (uid, state) =>
  as(uid, async () => (await one(`select sync_shop_state($1::jsonb) r`, [JSON.stringify(state)])).r);

/* 1 + 5: Ei kaufen → abbrechen → Ei kaufen … (der echte Fehlerfall) */
{
  // Start: 500 Münzen Bestand, nichts ausgegeben
  await sync(U1, { spentCoins: 0, refundedCoins: 0, nests: [] });
  // 5 × (Ei für 100 kaufen, abbrechen) — Client bucht Erstattung statt spentCoins zu senken
  let spent = 0, refunded = 0;
  for (let i = 0; i < 5; i++) {
    spent += 100;
    await sync(U1, { spentCoins: spent, refundedCoins: refunded, nests: [] });
    refunded += 100;
    await sync(U1, { spentCoins: spent, refundedCoins: refunded, nests: [] });
  }
  const s = await shop(U1);
  ok('1  refundedCoins gemerged: spent=500 refunded=500', s.spentCoins === 500 && s.refundedCoins === 500,
     `spent=${s.spentCoins} refunded=${s.refundedCoins}`);
  ok('5  Kauf-Abbruch-Schleife flaggt nicht (netto 0)', await flags(U1) === 0);

  // Push ohne refundedCoins (alter Client / alter Tab) darf nichts löschen
  await sync(U1, { spentCoins: 500, nests: [] });
  ok('1b Push ohne refundedCoins behält die Erstattung', (await shop(U1)).refundedCoins === 500);

  // 2: alter Client senkt spentCoins lokal → greatest bleibt
  await sync(U1, { spentCoins: 400, nests: [] });
  const s2 = await shop(U1);
  ok('2  gesenkter spentCoins wird verworfen', s2.spentCoins === 500, `spent=${s2.spentCoins}`);
}

/* 3 + 4: Erstattungs-Pumpe */
{
  // spentCoins 10 000 (überzogen), dazu refundedCoins 10 000: Budget 3000 deckelt
  await sync(U2, { spentCoins: 10000, refundedCoins: 10000, nests: [] });
  const s = await shop(U2);
  ok('4  Erstattung auf Tagesbudget 3000 gekappt', s.refundedCoins === 3000, `refunded=${s.refundedCoins}`);
  ok('4b Flag geloggt', await flags(U2) === 1);
  const used = Number((await one(`select coin_sources c from shop_daily_gains where user_id=$1`, [U2])).c);
  ok('4c Budget belastet', used === 3000, `coin_sources=${used}`);

  // 3: Erstattung größer als spentCoins → auf spentCoins gekappt
  await db.exec(`update shop_daily_gains set coin_sources = 0 where user_id = '${U1}'`);
  await sync(U1, { spentCoins: 500, refundedCoins: 99999, nests: [] });
  const s1 = await shop(U1);
  ok('3  Erstattung ≤ spentCoins', s1.refundedCoins === 500, `refunded=${s1.refundedCoins}`);
}

/* 6 + 7: Überzogen netto, Reparatur */
{
  // Bestand: 745 Spiele + 786 Bank = 1531. spent 4490 → deutlich überzogen
  await sync(U3, { spentCoins: 4490, bankedCoins: 786, nests: [] });
  ok('6  Überzug netto wird geflaggt', await flags(U3) === 1);

  // Items sind jetzt gekürzt: Budget aus, Item-Kauf ohne Deckung → gekappt
  await db.exec(`update shop_daily_gains set items = 40 where user_id = '${U3}'`);
  await sync(U3, { spentCoins: 4500, bankedCoins: 786, coinsx3Count: 1, nests: [] });
  ok('6b ohne Reparatur: Item gekappt', (await shop(U3)).coinsx3Count !== 1,
     `coinsx3Count=${(await shop(U3)).coinsx3Count}`);

  // Reparatur wie im Support-SQL: refundedCoins direkt setzen (kein Sync-Budget)
  await db.exec(`update user_collectibles
                    set value = jsonb_set(value, '{refundedCoins}', '3000'::jsonb), updated_at = now()
                  where user_id = '${U3}' and key = 'shop_state'`);
  // Der Client schickt weiter seinen alten Stand (ohne refundedCoins)
  await sync(U3, { spentCoins: 4500, bankedCoins: 786, nests: [] });
  const s = await shop(U3);
  ok('7  Reparatur hält gegen Client-Push', s.refundedCoins === 3000 && s.spentCoins === 4500,
     `refunded=${s.refundedCoins} spent=${s.spentCoins}`);
  const balance = 745 + 786 - (s.spentCoins - s.refundedCoins);
  ok('7b Guthaben nach Reparatur positiv', balance === 31, `balance=${balance}`);

  // Item kaufen (10 🪙) — jetzt gedeckt, darf stehen bleiben
  await sync(U3, { spentCoins: 4510, bankedCoins: 786, coinsx3Count: 1, nests: [] });
  ok('7c Item nach Reparatur nicht mehr gekürzt', (await shop(U3)).coinsx3Count === 1,
     `coinsx3Count=${(await shop(U3)).coinsx3Count}`);
}

/* 8: Wiederholbarkeit */
{
  await run(mig('0185_refunded_coins.sql'), '0185 (2. Lauf)');
  const m = await one(`select shop_state_merge('{"refundedCoins":5}'::jsonb, '{"refundedCoins":9}'::jsonb) r`);
  ok('8  zweiter Lauf: Merge funktioniert weiter', m.r.refundedCoins === 9, JSON.stringify(m.r.refundedCoins));
  const old = await one(`select count(*) c from pg_proc where proname = '_shop_state_merge_v59'`);
  ok('8b alte Merge-Funktion nur einmal vorhanden', Number(old.c) === 1);
}

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
