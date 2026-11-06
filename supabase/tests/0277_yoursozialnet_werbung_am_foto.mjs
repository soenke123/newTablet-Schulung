/* Prüfstand für Migration 0277 — YourSozialNet: Werbung am Foto („Wo?“).

   Die Kernzusagen:
     1. Anzeige OHNE „Wo?“ → nur als Karte im Feed (ad der Seite), nie am Foto.
     2. Anzeige MIT „Wo?“ → nur an den berechneten Fotos (item.ad + sh_ad_pick
        über den Kommentaren), nie als Karte; „Wem?“ gilt zusätzlich.
     3. Pausiert → nirgends; sh_ad_pick ohne Foto → nichts.

   Aufruf:  node supabase/tests/0277_yoursozialnet_werbung_am_foto.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

const STUBS = `
create schema if not exists auth; create schema if not exists extensions;
set search_path = public, extensions;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create role service_role; create role authenticated; create role anon;
create publication supabase_realtime;
`;

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');
const BEKANNT = new Set(['0087']);

await db.exec(STUBS);
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
for (const f of FILES) {
  try { await db.exec(mig(f)); }
  catch (e) {
    if (BEKANNT.has(f.slice(0, 4))) continue;
    console.error(`FEHLER in ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);

const T1 = 'e0000000-0000-4000-8000-0000000000e1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T1]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 't1', 'T1', 'active', 'approved', true)`, [T1, SCHOOL]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const PNG = Buffer.from('fakewebp').toString('base64');

await as(T1);
let r = await call(`skill_room_create('socialhub', 'Info 9', false, '{}'::jsonb)`);
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
r = await call(`skill_room_create('socialhub', 'Info 10', false, '{}'::jsonb)`);
const CODE2 = r.code;
const ROOM2 = (await one(`select id from skill_rooms where code = $1`, [CODE2])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values
  ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon'), ($1, 'tokC', 3, 'Ali'), ($2, 'tokX', 1, 'Fremd')`, [ROOM, ROOM2]);


const setTables = async (code, t) => { await as(T1); await call(`skill_room_set_state($1, null, $2::jsonb)`, [code, JSON.stringify({ tables: t })]); };
const ads = async h => (await db.query(`select * from sh_ads where hub_id = $1 order by id`, [h])).rows;


await as(T1);
await call(`skill_room_set_state($1, null, '{"tables":["photos","tags","ads"]}'::jsonb)`, [CODE]);
await as(null);
const HUB = (await call(`sh_found('tokA', 'Mias Netz', 'bell')`)).hub;
const SA = (await call(`sh_register('tokA', $1, 'admin', 'pw1234', 'Mia')`, [HUB])).session;
for (let i = 0; i < 4; i++) {
  const m = await call(`sh_media_put('tokA', $1, $2, $3, $3, 'image/webp')`, [HUB, SA, PNG]);
  await call(`sh_photo_post('tokA', $1, $2, $3, $4, $5::jsonb)`, [HUB, SA, m.name, 'Foto ' + (i + 1), JSON.stringify(i < 2 ? ['hund'] : ['urlaub'])]);
}
const WO = "SELECT pt.photo_id FROM photo_tag pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = 'hund'";
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'Pfotenglück', 'ad', 'Futter', null, null, null, null, $3)`, [HUB, SA, WO]);
ok('1  Anzeige mit „Wo?“ speichern', r.ok && r.id === 1, JSON.stringify(r));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'Plus-Abo', 'ad', 'Ohne Werbung')`, [HUB, SA]);
ok('1  Anzeige ohne „Wo?“ speichern', r.ok && r.id === 2, JSON.stringify(r));
r = await call(`sh_enter('tokA', null, $1, $2)`, [HUB, SA]);
ok('1  ads_sql zählt auch „Wo?“', r.ads_sql === 1, JSON.stringify(r.ads_sql));
// das Admin-Gerät hat gerechnet: Hunde-Fotos 1 und 2
r = await call(`sh_ads_compute('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ id: 1, a: null, c: [1, 2, 999] }, { id: 2, a: null, c: null }])]);
ok('1  gerechnet', r.ok && r.done === 2, JSON.stringify(r));

const pages = async (mode, arg) => {
  const cards = new Set(), atPhoto = {};
  for (let seed = 0; seed < 15; seed++) {
    const f = await call(`sh_feed('tokA', null, $1, $2, $3, $4, 0, 8, $5)`, [HUB, SA, mode, arg || null, seed]);
    if (f.ad) cards.add(f.ad.name);
    f.items.forEach(x => { if (x.ad) atPhoto[x.id] = x.ad.name; });
  }
  return { cards, atPhoto };
};
let P = await pages('foryou');
ok('2  Karte im Feed: nur die Anzeige ohne „Wo?“', P.cards.size === 1 && P.cards.has('Plus-Abo'), JSON.stringify([...P.cards]));
ok('2  am Foto: Pfotenglück genau an den Hunde-Fotos 1 und 2', JSON.stringify(P.atPhoto) === JSON.stringify({ 1: 'Pfotenglück', 2: 'Pfotenglück' }), JSON.stringify(P.atPhoto));
P = await pages('tag', 'hund');
ok('2  auch in der Tag-Ansicht am Foto (aber keine Karte)', P.cards.size === 0 && P.atPhoto[1] === 'Pfotenglück', JSON.stringify(P));
r = await call(`sh_ad_pick('tokA', null, $1, $2, 'x', 1)`, [HUB, SA]);
ok('2  über den Kommentaren von Foto 1: Pfotenglück', r.ok && r.ad && r.ad.name === 'Pfotenglück' && /hund/.test(r.ad.content_sql), JSON.stringify(r));
r = await call(`sh_ad_pick('tokA', null, $1, $2, 'x', 3)`, [HUB, SA]);
ok('2  über den Kommentaren von Foto 3 (Urlaub): nichts', r.ok && r.ad === null, JSON.stringify(r));
r = await call(`sh_ad_pick('tokA', null, $1, $2, 'x')`, [HUB, SA]);
ok('2  ohne Foto: nichts', r.ok && r.ad === null, JSON.stringify(r));

// „Wem?“ gilt zusätzlich: Zielgruppe ohne Mia (id 1)
await call(`sh_ad_save('tokA', null, $1, $2, 1, 'Pfotenglück', 'ad', 'Futter', null, null, null, 'SELECT 99', $3)`, [HUB, SA, WO]);
await call(`sh_ads_compute('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ id: 1, a: [], c: [1, 2] }])]);
P = await pages('foryou');
ok('3  „Wem?“ passt nicht → auch am Foto nichts', Object.keys(P.atPhoto).length === 0, JSON.stringify(P.atPhoto));
await call(`sh_ads_compute('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ id: 1, a: [1], c: [1, 2] }])]);
P = await pages('foryou');
ok('3  „Wem?“ passt → wieder am Foto', P.atPhoto[1] === 'Pfotenglück', JSON.stringify(P.atPhoto));
await call(`sh_ad_active('tokA', null, $1, $2, 1, false)`, [HUB, SA]);
P = await pages('foryou');
r = await call(`sh_ad_pick('tokA', null, $1, $2, 'x', 1)`, [HUB, SA]);
ok('3  pausiert → nirgends', Object.keys(P.atPhoto).length === 0 && r.ad === null, JSON.stringify([P.atPhoto, r]));

let twice = true;
try { await db.exec(mig('0277_yoursozialnet_werbung_am_foto.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('3  Migration 0277 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
