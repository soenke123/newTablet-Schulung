/* Prüfstand für Migration 0276 — YourSozialNet: Werbung (Tabelle ads).
   Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. ads gibt es erst, wenn die Lehrkraft sie erstellt (im Klassen-Netz immer).
     2. Nur Admins legen Kampagnen an, schalten sie an/aus, löschen sie, sehen sie
        im Schnappschuss – ohne die internen Listen (audience/content).
     3. Der Server führt das SQL der Klasse NIE aus: target_sql/content_sql sind
        Text; die Zielgruppe kommt als Zahlen vom Admin-Gerät (sh_ads_compute),
        fremde ids fallen weg.
     4. sh_feed: Anzeige nur für die Zielgruppe, beworbene Fotos weit vorn mit
        „sponsored“, pausierte Kampagnen nirgends; sh_ad_pick für die Leiste.
     5. Dummy-Kampagnen auch im Klassen-Netz; Raum weg → alles weg; zweimal.

   Aufruf:  node supabase/tests/0276_yoursozialnet_werbung.mjs */
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

/* 1  Einschalten */
await as(null);
r = await call(`sh_found('tokA', 'Mias Netz', 'bell')`);
const HUB = r.hub;
r = await call(`sh_register('tokA', $1, 'admin', 'pw1234', 'Mia')`, [HUB]);
ok('1  Mia gründet und ist Admin', r.ok && r.admin === true, JSON.stringify(r));
const SA = r.session;
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'VOLTA')`, [HUB, SA]);
ok('1  ohne Tabelle ads → table_off', r.error === 'table_off', JSON.stringify(r));
await setTables(CODE, ['photos', 'likes', 'tags', 'ads']);
await as(null);
r = await call(`sh_enter('tokA', null, $1, $2)`, [HUB, SA]);
ok('1  ads in der Tabellenliste, ads_sql = 0', r.ok && r.tables.includes('ads') && r.ads_sql === 0, JSON.stringify([r.tables, r.ads_sql]));

/* 2  Kampagnen anlegen */
r = await call(`sh_register('tokB', $1, 'leon', 'pw1234', 'Leon')`, [HUB]).catch(e => ({ error: e.message }));
ok('2  Leon legt in Mias Netz kein Konto an (hub_private)', r.error === 'hub_private', JSON.stringify(r));
// Mia legt zwei weitere User an (wie per SQL) und postet Fotos
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([
  { t: 'users', op: 'insert', row: { id: 2, username: 'gamer', password: '', gender: 'male' } },
  { t: 'users', op: 'insert', row: { id: 3, username: 'oma', password: '', gender: 'female' } }])]);
ok('2  zwei User per SQL', r.ok, JSON.stringify(r));
for (let i = 0; i < 4; i++) {
  const m = await call(`sh_media_put('tokA', $1, $2, $3, $3, 'image/webp')`, [HUB, SA, PNG]);
  await call(`sh_photo_post('tokA', $1, $2, $3, $4, $5::jsonb)`, [HUB, SA, m.name, 'Foto ' + (i + 1), JSON.stringify(i === 3 ? ['wissenschaft'] : ['urlaub'])]);
}
ok('2  vier Fotos', Number((await one(`select count(*) n from sh_photos where hub_id = $1`, [HUB])).n) === 4);
const TGT = "SELECT id FROM users WHERE gender = 'male'";
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'VOLTA Energy', 'ad', 'Noch eine Runde?', 'Text', null, 'Jetzt', $3)`, [HUB, SA, TGT]);
ok('2  Anzeige anlegen', r.ok && r.id === 1, JSON.stringify(r));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'Sternwarte', 'boost', null, null, null, null, $3, $4)`,
  [HUB, SA, "SELECT id FROM users WHERE id = $user", "SELECT photo_id FROM photo_tag"]);
ok('2  beworbene Posts anlegen', r.ok && r.id === 2, JSON.stringify(r));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'Für alle', 'ad', 'Hallo')`, [HUB, SA]);
ok('2  Anzeige ohne Zielgruppe', r.ok && r.id === 3, JSON.stringify(r));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'fuck', 'ad')`, [HUB, SA]);
ok('2  Blacklist im Namen', r.error === 'blacklisted', JSON.stringify(r));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'X', 'banner')`, [HUB, SA]);
ok('2  unbekannte Art → invalid_input', r.error === 'invalid_input', JSON.stringify(r));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'X', 'ad', null, null, 'https://evil.example/x.png')`, [HUB, SA]);
ok('2  Bild nur aus dem Netzwerk → invalid_image', r.error === 'invalid_image', JSON.stringify(r));
r = await call(`sh_ad_save('tokA', null, $1, $2, null, 'Böse', 'ad', null, null, null, null, 'DROP TABLE sh_users; DELETE FROM sh_hubs')`, [HUB, SA]);
ok('2  „SQL“ mit DROP wird nur als Text gespeichert …', r.ok, JSON.stringify(r));
ok('2  … und nie ausgeführt', Number((await one(`select count(*) n from sh_users where hub_id = $1`, [HUB])).n) === 3 && Number((await one(`select count(*) n from sh_hubs`)).n) === 1);
await call(`sh_ad_delete('tokA', null, $1, $2, 4)`, [HUB, SA]);

/* 3  Schnappschuss + SQL */
r = await call(`sh_db_snapshot('tokA', null, $1, $2)`, [HUB, SA]);
ok('3  Schnappschuss: ads mit sichtbaren Spalten, ohne audience/content',
   r.ok && r.tables.ads && r.tables.ads.cols.join() === 'id,user_id,name,kind,title,body,image,button,target_sql,content_sql,active,created_at'
   && r.tables.ads.rows.length === 3 && r.tables.ads.rows[0][1] === 1 && r.tables.ads.rows[0][10] === true, JSON.stringify(r.tables && r.tables.ads));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'ads', op: 'insert', row: { id: 7, name: 'Per SQL', target_sql: 'SELECT 1' } }])]);
ok('3  INSERT INTO ads per SQL (kind/active vorbelegt)', r.ok, JSON.stringify(r));
const a7 = (await ads(HUB)).find(x => x.id === 7);
ok('3  … kind ad, active true', a7 && a7.kind === 'ad' && a7.active === true, JSON.stringify(a7));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'ads', op: 'update', key: { id: 7 }, row: { id: 7, kind: 'popup' } }])]);
ok('3  kind popup → CHECK abgelehnt', !r.ok && r.state === '23514', JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'ads', op: 'update', key: { id: 7 }, row: { id: 7, active: 0 } }])]);
ok('3  UPDATE ads SET active = 0 (wie aus SQLite)', r.ok && (await ads(HUB)).find(x => x.id === 7).active === false, JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'ads', op: 'insert', row: { id: 8, name: 'X', audience: '{1,2}' } }])]);
ok('3  audience ist per SQL nicht setzbar', r.ok && (await ads(HUB)).find(x => x.id === 8).audience === null, JSON.stringify(r));
await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'ads', op: 'delete', key: { id: 8 } }, { t: 'ads', op: 'delete', key: { id: 7 } }])]);

/* 4  Rechnen (Zahlen vom Admin-Gerät) */
r = await call(`sh_enter('tokA', null, $1, $2)`, [HUB, SA]);
ok('4  ads_sql zählt Kampagnen mit Abfrage', r.ads_sql === 2, JSON.stringify(r.ads_sql));
r = await call(`sh_ads_compute('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([
  { id: 1, a: [2, 999, 'x'], c: null }, { id: 2, a: [1, 2], c: [4, 77] }, { id: 3, a: null, c: null }, { id: 55, a: [1] }])]);
ok('4  sh_ads_compute übernimmt 3 Kampagnen', r.ok && r.done === 3, JSON.stringify(r));
let A = await ads(HUB);
ok('4  fremde ids und Text fallen weg', JSON.stringify(A[0].audience) === '[2]' && JSON.stringify(A[1].content) === '[4]' && A[2].audience === null && A[0].computed_at, JSON.stringify(A.map(x => [x.id, x.audience, x.content])));

/* 5  Ausspielen */
// Feed als Mia (id 1): nicht männlich → keine VOLTA-Anzeige, aber „Für alle“; Boost-Zielgruppe enthält 1
const feedAds = async (mode) => {
  const seen = new Set(); let spons = null, first = null;
  for (let seed = 0; seed < 25; seed++) {
    const f = await call(`sh_feed('tokA', null, $1, $2, $3, null, 0, 8, $4)`, [HUB, SA, mode, seed]);
    if (f.ad) seen.add(f.ad.name);
    if (first === null) first = f.items[0];
    const sp = f.items.find(x => x.sponsored); if (sp) spons = sp;
  }
  return { seen, spons, first };
};
// das beworbene Foto ist alt – kommt trotzdem nach vorn
await db.query(`update sh_photos set created_at = now() - interval '60 days' where hub_id = $1 and id = 4`, [HUB]);
let F = await feedAds('foryou');
ok('5  Mia sieht nur Anzeigen ihrer Zielgruppe (Für alle), nicht VOLTA', F.seen.has('Für alle') && !F.seen.has('VOLTA Energy'), JSON.stringify([...F.seen]));
ok('5  beworbenes Foto ganz vorn, mit sponsored und den Abfragen', F.first && F.first.id === 4 && F.first.sponsored && F.first.sponsored.name === 'Sternwarte'
   && /photo_tag/.test(F.first.sponsored.content_sql), JSON.stringify(F.first && F.first.sponsored));
F = await feedAds('following');
ok('5  „Folge ich“: keine beworbenen Fotos', !F.spons, JSON.stringify(F.spons));
r = await call(`sh_feed('tokA', null, $1, $2, 'tag', 'urlaub')`, [HUB, SA]);
ok('5  Tag-Ansicht: keine Anzeige', r.ok && !r.ad, JSON.stringify(r.ad));
// Zielgruppen neu gerechnet: VOLTA jetzt für Mia, der Boost nur noch für den Gamer
await call(`sh_ads_compute('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ id: 1, a: [1] }, { id: 2, a: [2], c: [4] }])]);
F = await feedAds('foryou');
ok('5  nach neuer Rechnung: VOLTA ja, Boost nicht mehr', F.seen.has('VOLTA Energy') && !F.spons, JSON.stringify([[...F.seen], F.first && F.first.id]));
r = await call(`sh_ad_pick('tokA', null, $1, $2, 'c1')`, [HUB, SA]);
ok('5  sh_ad_pick ohne Foto: keine Leiste (seit 0277 nur Anzeigen mit „Wo?“ am Foto)', r.ok && r.ad === null, JSON.stringify(r));
r = await call(`sh_ad_active('tokA', null, $1, $2, 1, false)`, [HUB, SA]);
await call(`sh_ad_active('tokA', null, $1, $2, 3, false)`, [HUB, SA]);
F = await feedAds('foryou');
ok('5  pausiert → nirgends', r.ok && F.seen.size === 0, JSON.stringify([...F.seen]));
await call(`sh_ad_active('tokA', null, $1, $2, 1, true)`, [HUB, SA]);
r = await call(`sh_ad_save('tokA', null, $1, $2, 1, 'VOLTA Energy', 'ad', 'Neu', null, null, null, 'SELECT 2')`, [HUB, SA]);
A = await ads(HUB);
ok('5  neue Abfrage → alte Zielgruppe gilt nicht mehr', r.ok && A[0].audience === null && A[0].title === 'Neu', JSON.stringify(A[0]));
F = await feedAds('foryou');
ok('5  … bis neu gerechnet ist, sieht sie niemand', !F.seen.has('VOLTA Energy'), JSON.stringify([...F.seen]));

/* 6  Rechte */
await as(null);
r = await call(`sh_found('tokB', 'Leons Netz', 'rocket')`);
const HB = r.hub;
const SB = (await call(`sh_register('tokB', $1, 'admin', 'pw1234')`, [HB])).session;
r = await call(`sh_db_apply('tokB', null, $1, $2, $3::jsonb)`, [HB, SB, JSON.stringify([{ t: 'users', op: 'insert', row: { id: 2, username: 'mitglied', password: '' } }])]);
r = await call(`sh_ad_save('tokB', null, $1, $2, null, 'Leon', 'ad')`, [HUB, SB]);
ok('6  fremdes Netzwerk → hub_private', r.error === 'hub_private', JSON.stringify(r));
r = await call(`sh_ads_compute('tokB', null, $1, $2, '[]'::jsonb)`, [HUB, SB]);
ok('6  … auch beim Rechnen', r.error === 'hub_private', JSON.stringify(r));
// normaler User im Klassen-Netz: kein Admin
await as(T1);
r = await call(`sh_found(null, 'Klasse 9b', 'mesh', null, 'auto', $1, true)`, [CODE]);
const CLS = r.hub;
await call(`sh_register(null, $1, 'lehrer', 'geheim1', 'Frau T', null, null, null, null, null, null, null, $2)`, [CLS, CODE]);
await as(null);
const SC = (await call(`sh_register('tokC', $1, 'ali', 'pw1234', 'Ali')`, [CLS])).session;
r = await call(`sh_enter('tokC', null, $1, $2)`, [CLS, SC]);
ok('6  Klassen-Netz: ads immer da, normaler User bekommt kein ads_sql', r.ok && r.tables.includes('ads') && r.ads_sql === null, JSON.stringify([r.tables, r.ads_sql]));
r = await call(`sh_ad_save('tokC', null, $1, $2, null, 'Ali', 'ad')`, [CLS, SC]);
ok('6  normaler User legt keine Kampagne an', r.error === 'not_admin', JSON.stringify(r));
r = await call(`sh_ads_compute('tokC', null, $1, $2, '[]'::jsonb)`, [CLS, SC]);
ok('6  … und rechnet nicht', r.error === 'not_admin', JSON.stringify(r));
r = await call(`sh_ad_active('tokC', null, $1, $2, 1, false)`, [CLS, SC]);
ok('6  … und schaltet nichts', r.error === 'not_admin', JSON.stringify(r));
await setTables(CODE, ['photos']);
await as(null);
r = await call(`sh_enter('tokA', null, $1, $2)`, [HUB, SA]);
ok('6  Tabelle entzogen → ads weg, Daten bleiben', r.ok && !r.tables.includes('ads') && (await ads(HUB)).length === 3, JSON.stringify(r.tables));
r = await call(`sh_feed('tokA', null, $1, $2, 'foryou', null, 0, 8, 1)`, [HUB, SA]);
ok('6  … und der Feed zeigt keine Werbung', r.ok && !r.ad && !r.items.some(x => x.sponsored), JSON.stringify(r.ad));
await setTables(CODE, ['photos', 'likes', 'tags', 'ads']);

/* 7  Dummy-Kampagnen */
{
  new Function(readFileSync(`${REPO}/MPSkills/tools/SocialHub/dummy/daten.js`, 'utf8'))();
  new Function(readFileSync(`${REPO}/MPSkills/tools/SocialHub/dummy/generator.js`, 'utf8'))();
  const G = globalThis.SHDummy;
  await as(T1);
  r = await call(`sh_dummy_status($1)`, [CODE2]);
  const D = G.build({ stichtag: r.stichtag, netz: '{netz}' });
  r = await call(`sh_dummy_put($1, 'ads', $2::jsonb, $3::jsonb)`, [CODE2, JSON.stringify(D.ads.cols), JSON.stringify(D.ads.rows)]);
  ok('7  Dummy-Kampagnen gespeichert (9)', r.ok && r.rows === 9, JSON.stringify(r));
  r = await call(`sh_found(null, 'Klasse 10a', 'like', null, 'auto', $1, true)`, [CODE2]);
  const C2 = r.hub;
  const A2 = await ads(C2);
  ok('7  neues Klassen-Netz bekommt die Kampagnen (von der Plattform, user_id NULL)', A2.length === 9 && A2.every(x => x.user_id === null) && A2.some(x => x.kind === 'boost'), A2.length);
  ok('7  … sonst keine Dummy-Daten', Number((await one(`select count(*) n from sh_users where hub_id = $1`, [C2])).n) === 0);
  r = await call(`sh_dummy_status($1)`, [CODE2]);
  ok('7  Status nennt das Klassen-Netz getrennt', r.ok && r.class && r.class.id === C2 && 'ads' in r.class.dummy && !(C2 in r.hubs), JSON.stringify(r.class));
  r = await call(`sh_dummy_clear($1, 'ads', $2)`, [CODE2, C2]);
  ok('7  Leeren im Klassen-Netz', r.ok && (await ads(C2)).length === 0, JSON.stringify(r));
  r = await call(`sh_dummy_load($1, 'ads', $2)`, [CODE2, C2]);
  ok('7  Füllen im Klassen-Netz (nur ads)', r.ok && r.rows === 9 && (await ads(C2)).length === 9, JSON.stringify(r));
  r = await call(`sh_dummy_load($1, 'users', $2)`, [CODE2, C2]);
  ok('7  users ins Klassen-Netz weiter nicht', r.ok && r.rows === 0, JSON.stringify(r));
  r = await call(`sh_found(null, 'Mein Netz', 'bell', null, 'auto', $1)`, [CODE2]);
  ok('7  eigenes Netzwerk bekommt sie auch', (await ads(r.hub)).length === 9);
  r = await call(`sh_dummy_put($1, 'ads', $2::jsonb, $3::jsonb)`, [CODE2, JSON.stringify(D.ads.cols), JSON.stringify([[1, null, 'fuck', 'ad', null, null, null, null, null, null, true, null]])]);
  ok('7  Blacklist im Dummy-Namen', r.error === 'blacklisted', JSON.stringify(r));
}

/* 8  User weg, Raum weg, zweimal */
await as(null);
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'insert', row: { id: 9, username: 'kunde', password: '' } },
  { t: 'ads', op: 'insert', row: { id: 9, user_id: 9, name: 'Kunde' } }])]);
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'delete', key: { id: 9 } }])]);
const a9 = (await ads(HUB)).find(x => x.id === 9);
ok('8  User gelöscht → Kampagne bleibt, user_id NULL', r.ok && a9 && a9.user_id === null, JSON.stringify([r, a9 && a9.user_id]));
await db.query(`delete from skill_rooms where id in ($1, $2)`, [ROOM, ROOM2]);
ok('8  Raum weg → Kampagnen weg', Number((await one(`select count(*) n from sh_ads`)).n) === 0);
let twice = true;
try { await db.exec(mig('0276_yoursozialnet_werbung.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('8  Migration 0276 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
