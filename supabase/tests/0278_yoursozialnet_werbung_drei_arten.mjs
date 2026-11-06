/* Prüfstand für Migration 0278 — YourSozialNet: drei Arten von Werbung + Häufigkeit.

   Die Kernzusagen:
     1. kind ist feed | label | boost; altes 'ad' wird zu feed (ohne „Wo?“)
        bzw. label (mit „Wo?“) – im Bestand, per sh_ad_save und per SQL.
     2. feed hat nur „Wem?“ (content_sql fällt weg), boost hat kein Bild/Text.
     3. Feed-Werbung nur als Karte, Foto-Label nur am Foto.
     4. Feed-Werbung nach jedem n-ten Foto (3/5/10, sh_ad_every nur Admins);
        weniger Fotos als n → eine Karte am Ende der Runde.

   Aufruf:  node supabase/tests/0278_yoursozialnet_werbung_drei_arten.mjs */
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
// erst bis 0277, Bestand mit alten 'ad'-Zeilen anlegen, dann 0278
const before = FILES.filter(f => f < '0278'), after = FILES.filter(f => f >= '0278');
const run = async list => {
  for (const f of list) {
    try { await db.exec(mig(f)); }
    catch (e) {
      if (BEKANNT.has(f.slice(0, 4))) continue;
      console.error(`FEHLER in ${f}: ${e.message}`);
      process.exit(1);
    }
  }
};
await run(before);

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
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon')`, [ROOM]);
await call(`skill_room_set_state($1, null, '{"tables":["photos","tags","ads"]}'::jsonb)`, [CODE]);
await as(null);
const HUB = (await call(`sh_found('tokA', 'Mias Netz', 'bell')`)).hub;
const SA = (await call(`sh_register('tokA', $1, 'admin', 'pw1234', 'Mia')`, [HUB])).session;
const post = async (n, tags) => {
  for (let i = 0; i < n; i++) {
    const m = await call(`sh_media_put('tokA', $1, $2, $3, $3, 'image/webp')`, [HUB, SA, PNG]);
    await call(`sh_photo_post('tokA', $1, $2, $3, $4, $5::jsonb)`, [HUB, SA, m.name, 'Foto', JSON.stringify(tags)]);
  }
};
await post(2, ['hund']);
await post(2, ['urlaub']);
const WO = "SELECT pt.photo_id FROM photo_tag pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = 'hund'";
// Bestand vor 0278 (alte Art 'ad')
await call(`sh_ad_save('tokA', null, $1, $2, null, 'Pfotenglück', 'ad', 'Futter', null, null, null, null, $3)`, [HUB, SA, WO]);
await call(`sh_ad_save('tokA', null, $1, $2, null, 'Plus-Abo', 'ad', 'Ohne Werbung')`, [HUB, SA]);

await run(after);
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);
const ads = async () => (await db.query(`select * from sh_ads where hub_id = $1 order by id`, [HUB])).rows;

/* 1  Bestand + Arten */
let A = await ads();
ok('1  Bestand: ad mit „Wo?“ → label, ohne → feed', A[0].kind === 'label' && A[1].kind === 'feed', JSON.stringify(A.map(x => x.kind)));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'Glow', 'feed', 'Glow', null, null, null, null, 'SELECT 1')`, [HUB, SA]);
A = await ads();
ok('1  feed: „An welchen Fotos?“ fällt weg', r.ok && A[2].kind === 'feed' && A[2].content_sql === null, JSON.stringify(A[2]));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'Sterne', 'boost', 'Titel', 'Text', 'img_1.webp', 'Los', null, 'SELECT 1')`, [HUB, SA]);
A = await ads();
ok('1  boost: ohne Bild/Titel/Text/Knopf', r.ok && A[3].kind === 'boost' && A[3].title === null && A[3].image === null && A[3].button === null && A[3].content_sql === 'SELECT 1', JSON.stringify(A[3]));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'X', 'popup')`, [HUB, SA]);
ok('1  andere Art → invalid_input', !r.ok && r.error === 'invalid_input', JSON.stringify(r));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'Alt', 'ad', 'T', null, null, null, null, $3)`, [HUB, SA, WO]);
ok('1  altes Gerät schickt ad + „Wo?“ → label', r.ok && (await ads()).find(x => x.id === r.id).kind === 'label', JSON.stringify(r));
await call(`sh_ad_delete('tokA', null, $1, $2, $3)`, [HUB, SA, r.id]);
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'ads', op: 'insert', row: { id: 20, name: 'Per SQL', kind: 'label', content_sql: 'SELECT 1' } }])]);
ok('1  INSERT kind label per SQL', r.ok && (await ads()).find(x => x.id === 20).kind === 'label', JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'ads', op: 'update', key: { id: 20 }, row: { id: 20, kind: 'popup' } }])]);
ok('1  kind popup per SQL → CHECK abgelehnt', !r.ok && r.state === '23514', JSON.stringify(r));
await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'ads', op: 'delete', key: { id: 20 } }])]);
// nur Plus-Abo (feed) und Pfotenglück (label) laufen
await call(`sh_ad_active('tokA', null, $1, $2, 3, false)`, [HUB, SA]);
await call(`sh_ad_active('tokA', null, $1, $2, 4, false)`, [HUB, SA]);
await call(`sh_ads_compute('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ id: 1, a: null, c: [1, 2] }, { id: 2, a: null, c: [1, 2] }])]);
A = await ads();
ok('1  feed nimmt keine Foto-Liste an', A[1].content === null, JSON.stringify(A[1].content));

/* 2  Feed-Werbung nur als Karte, Label nur am Foto */
const pageAll = async (mode, seed = 0) => {
  const f = await call(`sh_feed('tokA', null, $1, $2, $3, null, 0, 20, $4)`, [HUB, SA, mode, seed]);
  return f;
};
let F = await pageAll('foryou');
ok('2  Karten: nur Feed-Werbung', F.ads.length >= 1 && F.ads.every(x => x.ad.name === 'Plus-Abo'), JSON.stringify(F.ads));
const atPhoto = {}; F.items.forEach(x => { if (x.ad) atPhoto[x.id] = x.ad.name; });
ok('2  Label nur an den Hunde-Fotos', JSON.stringify(atPhoto) === JSON.stringify({ 1: 'Pfotenglück', 2: 'Pfotenglück' }), JSON.stringify(atPhoto));

/* 3  Häufigkeit */
r = await call(`sh_ad_every('tokA', null, $1, $2)`, [HUB, SA]);
ok('3  Standard: nach jedem 5. Foto', r.ok && r.every === 5, JSON.stringify(r));
ok('3  4 Fotos < 5 → eine Karte am Ende der Runde', F.every === 5 && F.ads.length === 1 && F.ads[0].after === 3, JSON.stringify(F.ads.map(x => x.after)));
await post(8, ['urlaub']);   // jetzt 12 Fotos
const afters = async (every) => {
  if (every) await call(`sh_ad_every('tokA', null, $1, $2, $3)`, [HUB, SA, every]);
  // in Seiten zu 6 wie die App: Positionen über alle Seiten
  const pos = [];
  for (let off = 0; off < 12; off += 6) {
    const f = await call(`sh_feed('tokA', null, $1, $2, 'foryou', null, $3, 6, 7)`, [HUB, SA, off]);
    f.ads.forEach(x => pos.push(off + x.after + 1));
  }
  return pos;
};
ok('3  alle 5: nach Foto 5 und 10', JSON.stringify(await afters()) === '[5,10]', JSON.stringify(await afters()));
ok('3  alle 3: nach 3, 6, 9, 12', JSON.stringify(await afters(3)) === '[3,6,9,12]', JSON.stringify(await afters()));
ok('3  alle 10: nach 10', JSON.stringify(await afters(10)) === '[10]', JSON.stringify(await afters()));
r = await call(`sh_feed('tokA', null, $1, $2, 'foryou', null, 0, 6, 7)`, [HUB, SA]);
ok('3  alte Geräte: ad = erste Karte bzw. null', 'ad' in r && r.ad === null && r.ads.length === 0, JSON.stringify(r.ad));
r = await call(`sh_ad_every('tokA', null, $1, $2, 4)`, [HUB, SA]);
ok('3  nur 3/5/10', !r.ok && r.error === 'invalid_input', JSON.stringify(r));
r = await call(`sh_feed('tokA', null, $1, $2, 'tag', 'urlaub', 0, 20, 1)`, [HUB, SA]);
ok('3  Tag-Ansicht: keine Karten', r.ok && r.ads.length === 0, JSON.stringify(r.ads));

/* 4  Rechte */
const SM = (await call(`sh_register('tokA', $1, 'mitglied', 'pw1234', 'M')`, [HUB])).session;
r = await call(`sh_ad_every('tokA', null, $1, $2, 3)`, [HUB, SM]);
ok('4  normaler User darf die Häufigkeit nicht ändern', !r.ok && r.error === 'not_admin', JSON.stringify(r));
r = await call(`sh_ad_every('tokB', null, $1, null, 3)`, [HUB]);
ok('4  fremder Schüler kommt nicht ins Netzwerk', !r.ok, JSON.stringify(r));
await as(T1);
r = await call(`sh_ad_every(null, $1, $2, null, 5)`, [CODE, HUB]);
ok('4  Lehrkraft darf', r.ok && r.every === 5, JSON.stringify(r));

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
