/* Prüfstand für Migration 0262–0270 — YourSozialNet (bis 0265 „Social Hub“, MPSkill „socialhub“).
   Echt gerechnet in pglite auf der ganzen Kette 0001…0262.

   Die Kernzusagen:
     1. Skill steht in der Registry, nur für Admins.
     2. Netzwerk gründen in zwei Schritten: erst Name/Logo/Farbe, dann das
        erste Konto des Gründers = Admin. Schüler nur im eigenen Netzwerk
        (anderes Gerät: sh_login_net).
     3. Registrieren / Anmelden mit bcrypt; falsches Passwort → wrong_login.
        Klartext-Passwort per SQL → Anmelden scheitert (gewollt).
     4. Likes/Folgen/Kommentare gehen erst, wenn die Lehrkraft die Tabelle erstellt.
     5. Feed (für dich / folge ich / Tag / Nutzer), Profil, Suche, Kommentare mit Herz.
     6. Datenbank: Schnappschuss nur erstellte Tabellen, nur Admins;
        sh_db_apply übernimmt INSERT/UPDATE/DELETE, lehnt Fehler ganz ab.
     7. Lehrkraft: Übersicht, Admin auf jedem Hub, sperren, fremde Lehrkraft nicht.
     8. Raum weg → alles weg. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0262_socialhub.mjs */
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
const T2 = 'e0000000-0000-4000-8000-0000000000e2';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T1, T2]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $3, 't1', 'T1', 'active', 'approved', true),
                       ($2, $3, 't2', 'T2', 'active', 'approved', false)`, [T1, T2, SCHOOL]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;

/* 1 */
ok('1  Skill steht in der Registry als YourSozialNet, nur Admins', (await one(`select count(*)::int n from skill_tools where id = 'socialhub' and folder = 'SocialHub' and admin_only and title = 'YourSozialNet'`)).n === 1);
await as(T2);
let r = await call(`skill_room_create('socialhub', 'Info 9', false, '{}'::jsonb)`).catch(e => ({ ok: false, error: e.message }));
ok('1  Nicht-Admin legt keinen Raum an', !r.ok, JSON.stringify(r));
await as(T1);
r = await call(`skill_room_create('socialhub', 'Info 9', false, '{}'::jsonb)`);
ok('1  Admin legt Raum an', r.ok, JSON.stringify(r));
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values
  ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon'), ($1, 'tokC', 3, null)`, [ROOM]);

/* 2 */
await as(null);
r = await call(`sh_home('tokA')`);
ok('2  Start: noch kein Netzwerk', r.ok && r.mine === null && r.hubs.length === 0 && r.tables.join() === 'users', JSON.stringify(r));
r = await call(`sh_found('tokA', 'Pixelwelt', 'rocket', '#FE2C55', 'light')`);
ok('2  Netzwerk gründen (Schritt 1, ohne Konto)', r.ok && r.hub && !r.session, JSON.stringify(r));
const HUB = r.hub;
r = await call(`sh_found('tokA', 'Zweiter', 'bell')`);
ok('2  zweites Netzwerk derselben Person → already_founded', r.error === 'already_founded');
r = await call(`sh_found('tokB', 'X', 'bell')`);
ok('2  Name zu kurz → invalid_name', r.error === 'invalid_name');
r = await call(`sh_found('tokB', 'Scheisse Hub', 'bell')`);
ok('2  Blacklist im Namen', r.error === 'blacklisted');
r = await call(`sh_found('tokB', 'Leons Netz', 'mesh', 'blau')`);
ok('2  Farbe kein #rrggbb → invalid_color', r.error === 'invalid_color');
r = await call(`sh_found('tokB', 'Leons Netz', 'mesh')`);
ok('1  ohne Angabe: Farbschema auto (0266)', r.ok && (await one(`select scheme from sh_hubs where id = $1`, [r.hub])).scheme === 'auto');
ok('2  zweites Netzwerk (andere Person)', r.ok);
const HUB2 = r.hub;
r = await call(`sh_enter('tokA', null, $1, null)`, [HUB]);
ok('2  Gründer ohne Konto: Admin, needs_admin, Farbe/Schema gespeichert',
   r.ok && r.admin && r.founder && r.me === null && r.needs_admin === true && r.hub.color === '#fe2c55' && r.hub.scheme === 'light', JSON.stringify(r));
r = await call(`sh_register('tokA', $1, 'admin', 'geheim1', 'Mia', null, null, null, 'female')`, [HUB]);
ok('2  Schritt 2: erstes Konto des Gründers wird Admin', r.ok && r.admin === true, JSON.stringify(r));
let SA = r.session;
r = await call(`sh_enter('tokA', null, $1, $2)`, [HUB, SA]);
ok('2  Gründer angemeldet als admin', r.ok && r.me.username === 'admin' && r.me.role === 'admin' && r.me.gender === 'female' && r.needs_admin === false);
r = await call(`sh_enter('tokA', null, $1, null)`, [HUB]);
ok('2  Schüler ohne Sitzung: nicht mehr automatisch angemeldet, nicht Admin', r.ok && r.me === null && r.session === null && !r.admin);
r = await call(`sh_enter('tokB', null, $1, null)`, [HUB]);
ok('2  Fremder Schüler kommt nicht in das Netzwerk → hub_private', r.error === 'hub_private');
r = await call(`sh_home('tokB')`);
ok('2  Fremder sieht nur sein eigenes Netzwerk', r.ok && r.hubs.length === 1 && r.hubs[0].id === HUB2 && r.mine === HUB2);
r = await call(`sh_brand('tokB', null, $1, null, 'Gekapert', 'bell', null, null, 'dark')`, [HUB]);
ok('2  Fremder ändert Marke nicht', r.error === 'hub_private');
r = await call(`sh_brand('tokA', null, $1, $2, 'Pixelwelt+', 'bell', null, null, 'auto')`, [HUB, SA]);
ok('2  Farbschema auto speichern (0266)', r.ok && r.hub.scheme === 'auto', JSON.stringify(r));
r = await call(`sh_brand('tokA', null, $1, $2, 'Pixelwelt+', 'bell', null, null, 'neon')`, [HUB, SA]);
ok('2  unbekanntes Farbschema → abgelehnt', r.error === 'invalid_input');
r = await call(`sh_brand('tokA', null, $1, $2, 'Pixelwelt+', 'custom', $3, '#12AB9F', 'light')`, [HUB, SA, Buffer.from('fakepng').toString('base64')]);
ok('2  Gründer: eigenes Logo + Farbschema', r.ok && r.hub.logo === 'custom' && r.hub.name === 'Pixelwelt+' && r.hub.color === '#12ab9f' && r.hub.scheme === 'light', JSON.stringify(r));
r = await call(`sh_brand('tokA', null, $1, $2, 'Pixelwelt+', 'custom', null, 'rot', 'dark')`, [HUB, SA]);
ok('2  Farbe kein #rrggbb → invalid_color', r.error === 'invalid_color');
r = await call(`sh_brand('tokA', null, $1, $2, 'Pixelwelt+', 'custom', null, null, 'bunt')`, [HUB, SA]);
ok('2  Schema außer dark/light → invalid_input', r.error === 'invalid_input');
r = await call(`sh_brand('tokA', null, $1, $2, 'Pixelwelt+', 'custom', null, null, 'dark')`, [HUB, SA]);
ok('2  Farbe leer = aus dem Logo, Logo bleibt', r.ok && r.hub.color === null && r.hub.scheme === 'dark' && r.hub.logo === 'custom');
r = await call(`sh_logo_get('tokA', null, $1)`, [HUB]);
ok('2  Logo holen', r.ok && Buffer.from(r.img, 'base64').toString() === 'fakepng');

/* 3 */
r = await call(`sh_register('tokA', $1, 'Leon_B', 'pw1234', 'Leon', 'leon@x.de', '2011-05-04', 'Kiel', 'male', 'Hi', 'Deutschland', 172)`, [HUB]);
ok('3  Gründer legt weiteres Konto an (Kleinschreibung, kein Admin)', r.ok && r.user === 2 && r.admin === false, JSON.stringify(r));
let SB = r.session;
r = await call(`sh_db_snapshot('tokA', null, $1, $2)`, [HUB, SB]);
ok('3  zweites Konto auf dem Gerät des Gründers ist kein Admin', r.error === 'not_admin');
r = await call(`sh_register('tokA', $1, 'leon_b', 'xyz123')`, [HUB]);
ok('3  Name vergeben → username_taken', r.error === 'username_taken');
r = await call(`sh_register('tokA', $1, 'a', 'xyz123')`, [HUB]);
ok('3  zu kurzer Name → invalid_username', r.error === 'invalid_username');
r = await call(`sh_register('tokA', $1, 'tom', 'xyz123', null, null, '3000-01-01')`, [HUB]);
ok('3  Geburtstag in der Zukunft → invalid_birthday', r.error === 'invalid_birthday');
r = await call(`sh_register('tokA', $1, 'tom', 'xyz123', null, null, null, null, null, null, null, 400)`, [HUB]);
ok('3  Größe außerhalb 50–250 cm → abgelehnt (0267)', r.error === 'invalid_centimeter', JSON.stringify(r));
r = await call(`sh_register('tokA', $1, 'tom', 'xyz123', null, null, null, null, 'robot')`, [HUB]);
ok('3  gender außerhalb des ENUM → invalid_gender', r.error === 'invalid_gender');
const hash = (await one(`select password from sh_users where hub_id = $1 and id = 2`, [HUB])).password;
ok('3  Passwort als bcrypt-Hash', /^\$2a\$08\$.{53}$/.test(hash), hash);
r = await call(`sh_login('tokA', $1, 'leon_b', 'falsch')`, [HUB]);
ok('3  falsches Passwort → wrong_login', r.error === 'wrong_login');
r = await call(`sh_login('tokC', $1, 'leon_b', 'pw1234')`, [HUB]);
ok('3  anderes Gerät kommt ohne Netzwerk-Login nicht hinein', r.error === 'hub_private');
r = await call(`sh_login_net('tokC', 'pixelwelt+', 'leon_b', 'falsch')`);
ok('3  Netzwerk-Login mit falschem Passwort → wrong_login', r.error === 'wrong_login');
r = await call(`sh_login_net('tokC', 'PIXELWELT+', 'LEON_B', 'pw1234')`);
ok('3  Anmelden auf anderem Gerät über Netzwerk-Name', r.ok && r.user === 2 && r.hub === HUB);
const SC = r.session;
r = await call(`sh_enter('tokC', null, $1, $2)`, [HUB, SC]);
ok('3  … mit der Sitzung kommt das Gerät hinein (kein Admin)', r.ok && r.me.username === 'leon_b' && !r.admin && !r.founder);
r = await call(`sh_home('tokC')`);
ok('3  … und sieht das Netzwerk auf der Startseite', r.hubs.length === 1 && r.hubs[0].id === HUB && r.mine === null);
r = await call(`sh_enter('tokB', null, $1, $2)`, [HUB, SC]);
ok('3  Sitzung gilt nur auf ihrem Gerät', r.error === 'hub_private');
r = await call(`sh_logout('tokC', $1, $2, true)`, [HUB, SC]);
ok('3  Auf allen Geräten abmelden', r.ok && (await one(`select count(*)::int n from sh_sessions where hub_id = $1 and user_id = 2`, [HUB])).n === 0);
r = await call(`sh_enter('tokC', null, $1, $2)`, [HUB, SC]);
ok('3  nach dem Abmelden ist das Netzwerk für das Gerät wieder zu', r.error === 'hub_private');
r = await call(`sh_login('tokA', $1, 'leon_b', 'pw1234')`, [HUB]);
SB = r.session;

/* 4 + 5: posten, Tabellen erstellen */
r = await call(`sh_photo_post('tokA', $1, $2, 'img_1.webp', 'Hallo', '[]'::jsonb)`, [HUB, SB]);
ok('4  photos noch nicht erstellt → table_off', r.error === 'table_off');
r = await call(`sh_feed('tokA', null, $1, $2)`, [HUB, SB]);
ok('4  Feed ohne photos: leer mit off', r.ok && r.off === true && r.items.length === 0);
r = await call(`sh_profile('tokA', null, $1, $2, 2)`, [HUB, SB]);
ok('4  Profil ohne photos: keine Fotos', r.ok && r.photos === null && r.photos_n === null);
await as(T1);
await call(`skill_room_set_state($1, null, '{"tables":["likes","tags"]}'::jsonb)`, [CODE]);
await as(null);
r = await call(`sh_enter('tokA', null, $1, $2)`, [HUB, SA]);
ok('4  likes/tags ohne photos zählen nicht', r.tables.join() === 'users', JSON.stringify(r.tables));
await as(T1);
await call(`skill_room_set_state($1, null, '{"tables":["photos"]}'::jsonb)`, [CODE]);
await as(null);
r = await call(`sh_photo_post('tokA', $1, $2, 'img_1.webp', 'Hallo', '[]'::jsonb)`, [HUB, SB]);
ok('4  Foto ohne hochgeladenes Bild → invalid_image', r.error === 'invalid_image');
const PNG = Buffer.from('x'.repeat(500)).toString('base64');
r = await call(`sh_media_put('tokA', $1, $2, $3, $3, 'image/webp')`, [HUB, SB, PNG]);
ok('4  Bild hochladen', r.ok && r.name === 'img_1.webp', JSON.stringify(r));
await call(`sh_media_put('tokA', $1, $2, $3, $3, 'image/webp')`, [HUB, SA, PNG]);
r = await call(`sh_photo_post('tokA', $1, $2, 'img_1.webp', 'Sonnenuntergang', '["#Natur","sommer"]'::jsonb)`, [HUB, SB]);
ok('4  Foto posten', r.ok && r.id === 1);
r = await call(`sh_photo_post('tokA', $1, $2, 'img_2.webp', 'Mein Hund', '["hund"]'::jsonb)`, [HUB, SA]);
ok('4  zweites Foto', r.ok && r.id === 2);
ok('4  Tags noch nicht erstellt → keine Tags gespeichert', (await one(`select count(*)::int n from sh_tags`)).n === 0);
r = await call(`sh_like('tokA', $1, $2, 1, true)`, [HUB, SA]);
ok('4  Like vor dem Erstellen → table_off', r.error === 'table_off');
r = await call(`sh_media_get('tokA', null, $1, '["img_1.webp","img_9.webp"]'::jsonb, true)`, [HUB]);
ok('4  Bilder holen', r.ok && r.items['img_1.webp'] && !r.items['img_9.webp']);

await as(T1);
r = await call(`skill_room_set_state($1, null, '{"tables":["photos","follows","likes","comments","comment_likes","tags"]}'::jsonb)`, [CODE]).catch(e => ({ error: e.message }));
if (!r || r.ok === false) {
  // Signatur je nach Stand von 0080: (code, version, data)
  ok('4  Lehrkraft erstellt Tabellen', false, JSON.stringify(r));
}
await as(null);
r = await call(`sh_enter('tokA', null, $1, $2)`, [HUB, SA]);
ok('4  erstellte Tabellen sichtbar', r.tables.includes('likes') && r.tables.includes('photo_tag'), JSON.stringify(r.tables));
ok('4  comment_likes gibt es nicht mehr, auch wenn es in data.tables steht (0267)', !r.tables.includes('comment_likes'));
r = await call(`sh_like('tokA', $1, $2, 1, true)`, [HUB, SA]);
ok('5  Like', r.ok && r.likes === 1 && r.my_kind === 'heart');
r = await call(`sh_like('tokA', $1, $2, 1, true, 'thumb')`, [HUB, SA]);
ok('5  andere Art ersetzt die alte, zählt nicht doppelt (0267)', r.ok && r.likes === 1 && r.my_kind === 'thumb' && r.kinds.thumb === 1 && r.kinds.heart === 0, JSON.stringify(r));
r = await call(`sh_like('tokA', $1, $2, 1, true, 'wut')`, [HUB, SA]);
ok('5  unbekannte Art → abgelehnt', r.error === 'invalid_input');
r = await call(`sh_follow('tokA', $1, $2, 2, true)`, [HUB, SA]);
ok('5  Folgen', r.ok && r.followers === 1);
r = await call(`sh_follow('tokA', $1, $2, 1, true)`, [HUB, SA]);
ok('5  sich selbst folgen geht nicht', r.error === 'invalid_input');
r = await call(`sh_photo_post('tokA', $1, $2, 'img_1.webp', 'Noch einer', '["natur","see"]'::jsonb)`, [HUB, SB]);
ok('5  Foto mit Tags', r.ok && r.id === 3);
r = await call(`sh_comment_add('tokA', $1, $2, 2, 'Süß!')`, [HUB, SB]);
ok('5  Kommentar', r.ok && r.id === 1);
await call(`sh_comment_add('tokA', $1, $2, 2, 'Danke')`, [HUB, SA]);
ok('5  sh_comment_like gibt es nicht mehr (0267)', !(await one(`select count(*)::int n from pg_proc where proname = 'sh_comment_like'`)).n
   && !(await one(`select to_regclass('public.sh_comment_likes') is not null f`)).f);
r = await call(`sh_comments('tokA', null, $1, $2, 2)`, [HUB, SB]);
ok('5  Kommentare in Reihenfolge, ohne Herzen', r.ok && r.items.length === 2 && r.items[0].body === 'Süß!' && r.items[0].hearts === undefined && r.items[0].mine === true, JSON.stringify(r.items));
r = await call(`sh_feed('tokA', null, $1, $2, 'foryou', null, 0, 8, 7)`, [HUB, SA]);
ok('5  Für dich: alle 3 Fotos', r.ok && r.items.length === 3 && r.total === 3, JSON.stringify(r).slice(0, 200));
const it = r.items.find(x => x.id === 1);
ok('5  Foto mit Likes/liked/Kommentaren', it.likes === 1 && it.liked === true && it.my_kind === 'thumb' && it.kinds.thumb === 1 && it.comments === 0 && it.user.username === 'leon_b' && it.following === true);
r = await call(`sh_feed('tokA', null, $1, $2, 'foryou', null, 2, 8, 7)`, [HUB, SA]);
ok('5  zweite Seite', r.ok && r.items.length === 1);
r = await call(`sh_feed('tokA', null, $1, $2, 'following', null, 0, 8, 0)`, [HUB, SA]);
ok('5  Folge ich: eigene + gefolgte', r.ok && r.items.length === 3);
r = await call(`sh_feed('tokA', null, $1, $2, 'following', null, 0, 8, 0)`, [HUB, SB]);
ok('5  Folge ich (Leon folgt niemandem): nur eigene', r.ok && r.items.length === 2);
r = await call(`sh_feed('tokA', null, $1, $2, 'tag', 'NATUR', 0, 8, 0)`, [HUB, SB]);
ok('5  Tag-Feed', r.ok && r.items.length === 1 && r.items[0].id === 3 && r.items[0].tags.join() === 'natur,see');
r = await call(`sh_feed('tokA', null, $1, null, 'user', '1', 0, 8, 0)`, [HUB]);
ok('5  Feed eines Nutzers, ohne Anmeldung', r.ok && r.items.length === 1 && r.items[0].liked === null);
r = await call(`sh_profile('tokA', null, $1, $2, 2)`, [HUB, SB]);
ok('5  Profil', r.ok && r.me && r.followers === 1 && r.photos_n === 2 && r.likes === 1, JSON.stringify(r).slice(0, 300));
r = await call(`sh_search('tokA', null, $1, $2, '#na')`, [HUB, SB]);
ok('5  Suche nach Tag', r.ok && r.tags.length === 1 && r.tags[0].name === 'natur');
r = await call(`sh_search('tokA', null, $1, $2, '@adm')`, [HUB, SB]);
ok('5  Suche nach Nutzer', r.ok && r.users.length === 1 && r.users[0].username === 'admin');
r = await call(`sh_me_update('tokA', $1, $2, 'Leon B.', 'Ich mag Fotos', 'img_1.webp', 'Kiel', 'male', 'Dänemark', 175)`, [HUB, SB]);
ok('5  Profil ändern', r.ok);
r = await call(`sh_profile('tokA', null, $1, $2, null)`, [HUB, SB]);
ok('5  Profil mit country und centimeter (0267)', r.ok && r.user.country === 'Dänemark' && r.user.centimeter === 175, JSON.stringify(r.user));

/* 6: Datenbank */
r = await call(`sh_login_net('tokC', 'Pixelwelt+', 'leon_b', 'pw1234')`);
const SC2 = r.session;
r = await call(`sh_db_snapshot('tokC', null, $1, $2)`, [HUB, SC2]);
ok('6  Nicht-Admin bekommt keinen Schnappschuss', r.error === 'not_admin');
r = await call(`sh_db_snapshot('tokA', null, $1, $2)`, [HUB, SA]);
ok('6  Schnappschuss', r.ok && r.tables.users.rows.length === 2 && r.tables.likes.rows.length === 1 && r.tables.photo_tag.rows.length === 2, Object.keys(r.tables || {}).join());
ok('6  Passwort-Hash im Schnappschuss', /^\$2a\$/.test(r.tables.users.rows[1][4]));
ok('6  gender im Schnappschuss', r.tables.users.cols[5] === 'gender' && r.tables.users.rows[1][5] === 'male');
ok('6  country/centimeter im Schnappschuss, kein comment_likes', r.tables.users.cols.join() === 'id,username,name,email,password,gender,bio,avatar,birthday,city,country,centimeter,role,created_at'
   && r.tables.users.rows[1][10] === 'Dänemark' && r.tables.users.rows[1][11] === 175 && !r.tables.comment_likes, JSON.stringify(r.tables.users.rows[1]));
ok('6  Zeit als Text', /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r.tables.users.rows[0][13]));
const BC = (await one(`select crypt('neu123', gen_salt('bf', 8)) h`)).h;
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([
  { t: 'users', op: 'insert', row: { id: 3, username: 'sqlkind', name: 'SQL', password: BC, gender: 'diverse', role: 'user', created_at: '2026-11-03 10:00:00' } },
  { t: 'users', op: 'insert', row: { id: 4, username: 'klartext', password: 'geheim' } },
  { t: 'photos', op: 'insert', row: { id: 4, user_id: 3, image: 'img_1.webp', description: 'per SQL' } },
  { t: 'likes', op: 'insert', row: { user_id: 3, photo_id: 1 } },
  { t: 'users', op: 'update', key: { id: 2 }, row: { id: 2, username: 'leon_b', name: 'Leon (geändert)', password: hash, role: 'user' } }
])]);
ok('6  INSERT/UPDATE übernommen', r.ok && r.done === 5, JSON.stringify(r));
r = await call(`sh_login_net('tokC', 'Pixelwelt+', 'sqlkind', 'neu123')`);
ok('6  per INSERT angelegtes Konto kann sich anmelden', r.ok);
r = await call(`sh_login_net('tokC', 'Pixelwelt+', 'klartext', 'geheim')`);
ok('6  Klartext-Passwort wird auf dem Server gehasht → Anmelden geht (0266)', r.ok, JSON.stringify(r));
ok('6  … und steht nie lesbar in der Tabelle', /^\$2a\$08\$/.test((await one(`select password from sh_users where hub_id = $1 and id = 4`, [HUB])).password));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'insert', row: { id: 8, username: '<img src=x onerror=alert(1)>', password: '' } }])]);
ok('6  Benutzername mit Zeichen außer [A-Za-z0-9._] → abgelehnt (0266)', !r.ok && /Benutzername/.test(r.message), JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: 4 }, row: { id: 4, bio: { x: 1 } } }])]);
ok('6  JSON-Objekt als Wert → abgelehnt (0266)', !r.ok, JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: 4 }, row: { id: 4, country: 'Schweden', centimeter: 181 } }])]);
ok('6  UPDATE country/centimeter (0267)', r.ok && (await one(`select centimeter from sh_users where hub_id = $1 and id = 4`, [HUB])).centimeter === 181, JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: 4 }, row: { id: 4, centimeter: 20 } }])]);
ok('6  centimeter außerhalb 50–250 → CHECK', !r.ok && /CHECK/.test(r.message));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'comment_likes', op: 'insert', row: { user_id: 1, comment_id: 1 } }])]);
ok('6  comment_likes per SQL → gibt es nicht', !r.ok && /gibt es hier nicht/.test(r.message));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'delete', key: { id: "1 or 1=1" } }])]);
ok('6  Schlüssel mit SQL darin → abgelehnt', !r.ok && /ganze Zahl/.test(r.message));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users; drop table sh_users; --', op: 'delete', key: { id: 1 } }])]);
ok('6  Tabellenname mit SQL darin → abgelehnt', !r.ok && (await one(`select to_regclass('public.sh_users') is not null f`)).f);
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: 4 }, row: { id: 4, 'name = (select 1) --': 'x', name: "Robert'); DROP TABLE sh_users; --" } }])]);
ok('6  fremde Spaltennamen ignoriert, Wert bleibt Text', r.ok && (await one(`select name from sh_users where hub_id = $1 and id = 4`, [HUB])).name === "Robert'); DROP TABLE sh_users; --", JSON.stringify(r));
ok('6  created_at fehlt → jetzt', (await one(`select created_at > now() - interval '1 minute' f from sh_users where hub_id = $1 and id = 4`, [HUB])).f);
ok('6  created_at als deutsche Zeit', (await one(`select to_char(created_at at time zone 'Europe/Berlin', 'HH24:MI') t from sh_users where hub_id = $1 and id = 3`, [HUB])).t === '10:00');
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([
  { t: 'users', op: 'insert', row: { id: 5, username: 'ok1', password: '' } },
  { t: 'photos', op: 'insert', row: { id: 9, user_id: 77, image: 'x' } }
])]);
ok('6  Fremdschlüssel ins Leere → alles abgelehnt', !r.ok && r.error === 'db_rejected' && /Fremdschlüssel/.test(r.message) && !/sh_/.test(r.message), r.message);
ok('6  … auch die erste Zeile nicht übernommen', (await one(`select count(*)::int n from sh_users where hub_id = $1 and id = 5`, [HUB])).n === 0);
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'insert', row: { id: 6, username: 'admin', password: '' } }])]);
ok('6  doppelter Benutzername → abgelehnt', !r.ok && /gibt es schon/.test(r.message), r.message);
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: 3 }, row: { id: 3, role: 'chef' } }])]);
ok('6  Rolle außerhalb ENUM → abgelehnt', !r.ok && /CHECK/.test(r.message));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: 3 }, row: { id: 3, gender: 'robot' } }])]);
ok('6  gender außerhalb ENUM → abgelehnt', !r.ok && /CHECK/.test(r.message));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'insert', row: { id: 7, username: 'fuck', password: '' } }])]);
ok('6  Blacklist auch per SQL', !r.ok && /gesperrtes Wort/.test(r.message));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'secret', op: 'insert', row: {} }])]);
ok('6  unbekannte Tabelle → abgelehnt', !r.ok);
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'delete', key: { id: 3 } }])]);
ok('6  DELETE mit Kaskade', r.ok && (await one(`select count(*)::int n from sh_photos where hub_id = $1 and id = 4`, [HUB])).n === 0);
r = await call(`sh_db_apply('tokC', null, $1, $2, '[]'::jsonb)`, [HUB, SC2]);
ok('6  Nicht-Admin darf nicht schreiben', r.error === 'not_admin');
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: 2 }, row: { id: 2, role: 'admin' } }])]);
r = await call(`sh_db_snapshot('tokC', null, $1, $2)`, [HUB, SC2]);
ok('6  per UPDATE zum Admin gemacht → Datenbank offen', r.ok);
r = await call(`sh_db_snapshot('tokA', null, $1, $2)`, [HUB2, null]);
ok('6  Schnappschuss eines fremden Netzwerks → hub_private', r.error === 'hub_private');

/* 7: Lehrkraft */
await as(T1);
r = await call(`sh_home(null, $1)`, [CODE]);
ok('7  Lehrkraft: Übersicht aller Netzwerke', r.ok && r.teacher && r.hubs.length === 2 && r.hubs[0].person === 'Mia' && r.hubs[0].owner === 'admin' && r.hubs[0].photos === 3, JSON.stringify(r.hubs[0]));
r = await call(`sh_enter(null, $1, $2, null)`, [CODE, HUB2]);
ok('7  Lehrkraft ist Admin auf jedem Netzwerk', r.ok && r.admin && r.teacher && r.me === null && r.needs_admin === false, JSON.stringify(r));
r = await call(`sh_admin_users(null, $1, $2, null)`, [CODE, HUB]);
ok('7  Lehrkraft sieht, wer dahintersteckt', r.ok && r.items.find(u => u.username === 'leon_b').person === 'Mia');
r = await call(`sh_admin_reset($1, $2)`, [CODE, HUB]);
ok('7  Admin-Passwort zurücksetzen: Name + lesbares Passwort', r.ok && r.username === 'admin' && /^[a-z]{6}\d\d$/.test(r.password), JSON.stringify(r));
const NEWPW = r.password;
ok('7  … alte Sitzungen des Admins sind weg', (await one(`select count(*)::int n from sh_sessions where hub_id = $1 and user_id = 1`, [HUB])).n === 0);
r = await call(`sh_admin_reset($1, $2)`, [CODE, HUB2]);
ok('7  Netzwerk ohne Admin-Konto → no_admin', r.error === 'no_admin');
await as(null);
r = await call(`sh_login('tokA', $1, 'admin', $2)`, [HUB, NEWPW]);
ok('7  Schüler meldet sich mit dem neuen Passwort an', r.ok && r.user === 1);
SA = r.session;
r = await call(`sh_admin_reset($1, $2)`, [CODE, HUB]).catch(() => ({ error: 'nope' }));
ok('7  Schüler darf nicht zurücksetzen', !r.ok);
r = await call(`sh_admin_users('tokA', null, $1, $2)`, [HUB, SA]);
ok('7  Gründer sieht die Person dahinter nicht', r.ok && r.items.every(u => u.person === null));
await as(T1);
r = await call(`sh_admin_user(null, $1, $2, null, 2, 'password', 'reset99')`, [CODE, HUB]);
ok('7  Passwort zurücksetzen', r.ok && (await one(`select count(*)::int n from sh_sessions where hub_id = $1 and user_id = 2`, [HUB])).n === 0);
/* 7b: Netzwerk der Lehrkraft */
r = await call(`sh_found(null, 'Lehrerzimmer', 'graph', null, 'dark', $1)`, [CODE]);
ok('7b Lehrkraft gründet eigenes Netzwerk', r.ok, JSON.stringify(r));
const THUB = r.hub;
r = await call(`sh_found(null, 'Zweiter', 'graph', null, 'dark', $1)`, [CODE]);
ok('7b zweites Netzwerk der Lehrkraft → already_founded', r.error === 'already_founded');
r = await call(`sh_enter(null, $1, $2, null)`, [CODE, THUB]);
ok('7b ohne Konto: needs_admin', r.ok && r.needs_admin && r.me === null);
r = await call(`sh_register(null, $1, 'admin', 'lehrer1', 'Frau T', null, null, null, 'female', null, null, null, $2)`, [THUB, CODE]);
ok('7b Lehrkraft: erstes Konto wird Admin', r.ok && r.admin);
const TS = r.session;
r = await call(`sh_enter(null, $1, $2, null)`, [CODE, THUB]);
ok('7b Lehrkraft bleibt in ihrem Netzwerk immer angemeldet', r.ok && r.session && r.me.username === 'admin' && r.founder);
await call(`sh_media_put(null, $1, $2, $3, $3, 'image/webp', $4)`, [THUB, TS, PNG, CODE]);
r = await call(`sh_photo_post(null, $1, $2, 'img_1.webp', 'Beispielfoto', '["demo"]'::jsonb, '{"camera":"Testkamera","lat":53.5,"lon":10}'::jsonb, $3)`, [THUB, TS, CODE]);
ok('7b Lehrkraft postet in ihrem Netzwerk', r.ok && r.id === 1, JSON.stringify(r));
ok('7c Metadaten aus (Standard): nichts gespeichert (0268)', r.ok && Object.keys(r.meta).length === 0
   && (await one(`select count(*)::int n from sh_photos where hub_id = $1 and (camera is not null or taken_at is not null)`, [THUB])).n === 0, JSON.stringify(r));
{
  await as(T1);
  const st = (await one(`select data from skill_room_state where room_id = $1`, [ROOM])).data || {};
  await call(`skill_room_set_state($1, null, $2::jsonb)`, [CODE, JSON.stringify(Object.assign({}, st, { meta: true }))]);
  await call(`sh_media_put(null, $1, $2, $3, $3, 'image/webp', $4)`, [THUB, TS, PNG, CODE]);
  const META = { taken_at: '2026-10-12 14:32:05', camera: 'Apple iPhone 13', lat: 53.5510849, lon: 9.9936818 };
  r = await call(`sh_photo_post(null, $1, $2, 'img_2.webp', 'Mit Metadaten', '[]'::jsonb, $3::jsonb, $4)`, [THUB, TS, JSON.stringify(META), CODE]);
  const row = await one(`select to_char(taken_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI:SS') t, camera
                           from sh_photos where hub_id = $1 and id = $2`, [THUB, r.id]);
  ok('7c Metadaten an: Zeit und Kamera gespeichert, Ort nicht (0268/0269)', r.ok && row.t === META.taken_at && row.camera === 'Apple iPhone 13' && !('lat' in r.meta) && !('latitude' in r.meta), JSON.stringify([row, r.meta]));
  ok('7c photos hat keine Spalten latitude/longitude (0269)', (await one(`select count(*)::int n from information_schema.columns where table_name = 'sh_photos' and column_name in ('latitude','longitude')`)).n === 0);
  r = await call(`sh_feed(null, $1, $2, $3)`, [CODE, THUB, TS]);
  const it = r.items && r.items.find(x => x.description === 'Mit Metadaten');
  ok('7c Feed liefert camera/taken_at, keinen Ort', it && it.camera === 'Apple iPhone 13' && it.taken_at && !('latitude' in it), JSON.stringify(it));
  r = await call(`sh_db_snapshot(null, $1, $2, $3)`, [CODE, THUB, TS]);
  ok('7c Schnappschuss: photos mit taken_at, camera',
     r.ok && r.tables.photos.cols.join() === 'id,user_id,image,description,taken_at,camera,created_at'
     && r.tables.photos.rows.some(x => x[5] === 'Apple iPhone 13' && x[4] === META.taken_at), JSON.stringify(r.tables && r.tables.photos));
  await call(`sh_media_put(null, $1, $2, $3, $3, 'image/webp', $4)`, [THUB, TS, PNG, CODE]);
  const BAD = { taken_at: '1850-01-01 00:00', camera: '<script>' + 'x'.repeat(100), lat: 123, lon: 'abc' };
  r = await call(`sh_photo_post(null, $1, $2, 'img_3.webp', 'Falsche Metadaten', '[]'::jsonb, $3::jsonb, $4)`, [THUB, TS, JSON.stringify(BAD), CODE]);
  ok('7c falsche Metadaten fallen still weg, Posten klappt', r.ok && Object.keys(r.meta).length === 0, JSON.stringify(r));
  r = await call(`sh_photo_post(null, $1, $2, 'img_3.webp', 'Kein Objekt', '[]'::jsonb, '[1,2]'::jsonb, $3)`, [THUB, TS, CODE]);
  ok('7c Metadaten als Liste → ignoriert', r.ok && Object.keys(r.meta).length === 0, JSON.stringify(r));
  r = await call(`sh_db_apply(null, $1, $2, $3, $4::jsonb)`, [CODE, THUB, TS, JSON.stringify([{ t: 'photos', op: 'update', key: { id: 2 }, row: { id: 2, camera: 'Geändert' } }])]);
  ok('7c UPDATE photos SET camera per SQL', r.ok && (await one(`select camera from sh_photos where hub_id = $1 and id = 2`, [THUB])).camera === 'Geändert', JSON.stringify(r));
  r = await call(`sh_db_apply(null, $1, $2, $3, $4::jsonb)`, [CODE, THUB, TS, JSON.stringify([{ t: 'photos', op: 'update', key: { id: 2 }, row: { id: 2, camera: 'x'.repeat(81) } }])]);
  ok('7c camera länger als 80 → CHECK', r.error === 'db_rejected' && r.state === '23514', JSON.stringify(r));
}
r = await call(`sh_home(null, $1)`, [CODE]);
ok('7b Übersicht: Netzwerk der Lehrkraft vorn, als „mine“', r.ok && r.mine === THUB && r.hubs[0].id === THUB && r.hubs[0].teacher_hub === true && r.hubs[0].mine === true && /Lehrkraft/.test(r.hubs[0].person), JSON.stringify(r.hubs[0]));
r = await call(`sh_register(null, $1, 'frau_t_test', 'test99', null, null, null, null, null, null, null, null, $2)`, [HUB, CODE]);
ok('7b Lehrkraft legt Testkonto im Schüler-Netzwerk an (kein Admin)', r.ok && r.admin === false);
const TSB = r.session;
r = await call(`sh_like(null, $1, $2, 1, true, 'laugh', $3)`, [HUB, TSB, CODE]);
ok('7b … und liked dort als Userin', r.ok && r.likes >= 1, JSON.stringify(r));
r = await call(`sh_admin_users(null, $1, $2, null)`, [CODE, HUB]);
const TID = (await one(`select id from sh_users where hub_id = $1 and username = 'frau_t_test'`, [HUB])).id;
ok('7b hinter dem Testkonto steht die Lehrkraft', /Lehrkraft/.test(r.items.find(u => u.username === 'frau_t_test').person));
await as(null);
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: TID }, row: { id: TID, password: 'gekapert' } }])]);
ok('7b Admin des Netzwerks ändert das Testkonto der Lehrkraft nicht (0266)', !r.ok && /Testkonto/.test(r.message), JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'delete', key: { id: TID } }])]);
ok('7b … und löscht es nicht', !r.ok && /Testkonto/.test(r.message));
r = await call(`sh_home('tokA')`);
ok('7b Klasse sieht das Netzwerk der Lehrkraft nicht (kommt später)', !r.hubs.some(h => h.id === THUB));
r = await call(`sh_register('tokA', $1, 'mia_bei_lk', 'geheim1')`, [THUB]);
ok('7b Schülerin kommt nicht in das Netzwerk der Lehrkraft', r.error === 'hub_private', JSON.stringify(r));
r = await call(`sh_login_net('tokC', 'Lehrerzimmer', 'admin', 'lehrer1')`);
ok('7b … auch nicht über den Netzwerk-Login', r.error === 'wrong_login');
await as(T1);
r = await call(`sh_hub_lock($1, $2, true)`, [CODE, HUB2]);
ok('7  Netzwerk sperren', r.ok);
await as(null);
r = await call(`sh_enter('tokB', null, $1, null)`, [HUB2]);
ok('7  gesperrtes Netzwerk → hub_locked (auch für den Gründer)', r.error === 'hub_locked');
r = await call(`sh_home('tokB')`);
ok('7  Gründer sieht sein Netzwerk als gesperrt', r.hubs.length === 1 && r.hubs[0].locked === true);
await as(T2);
r = await call(`sh_home(null, $1)`, [CODE]);
ok('7  fremde Lehrkraft → not_found', r.error === 'not_found');
r = await call(`sh_hub_delete($1, $2)`, [CODE, HUB2]);
ok('7  fremde Lehrkraft löscht nicht', r.error === 'not_found');
r = await call(`sh_admin_reset($1, $2)`, [CODE, HUB]);
ok('7  fremde Lehrkraft setzt nichts zurück', r.error === 'not_found');
await as(T1);
r = await call(`sh_hub_delete($1, $2)`, [CODE, HUB2]);
ok('7  Lehrkraft löscht Netzwerk', r.ok);

/* 9  Analytics / Tracking (0270) — auf dem Netzwerk der Lehrkraft (hat Fotos 1–3) */
await as(T1);
await call(`skill_room_set_state($1, null, $2::jsonb)`, [CODE, JSON.stringify({ tables: ['photos', 'views'] })]);
ok('9  views ohne sessions → nicht da (braucht sessions)', (await call(`sh_on($1,'views')`, [ROOM])) === false && (await call(`sh_on($1,'sessions')`, [ROOM])) === false);
r = await call(`sh_track(null, $1, $2, null, '{}'::jsonb, null, '[]'::jsonb, false, null, $3)`, [THUB, TS, CODE]);
ok('9  ohne sessions wird nicht getrackt', r.ok && r.tracked === false && (await one(`select count(*)::int n from sh_vsessions`)).n === 0, JSON.stringify(r));
await call(`skill_room_set_state($1, null, $2::jsonb)`, [CODE, JSON.stringify({ tables: ['photos', 'sessions', 'views'] })]);
ok('9  Lehrkraft erstellt sessions + views → sh_on', (await call(`sh_on($1,'sessions')`, [ROOM])) === true && (await call(`sh_on($1,'views')`, [ROOM])) === true);
ok('9  kein Schalter, kein Zeitlimit mehr (alte Helfer weg)', (await one(`select count(*)::int n from pg_proc where proname in ('sh_analytics_on','sh_analytics_seen')`)).n === 0);
r = await call(`sh_enter(null, $1, $2, null)`, [CODE, THUB]);
ok('9  sessions+views stehen in der Tabellenliste', r.tables.includes('sessions') && r.tables.includes('views'));
const DEV = { user_agent: 'Mozilla/5.0 (iPad)', browser: 'Safari 18', os: 'iPadOS 18', device: 'iPad', device_type: 'tablet', screen_width: 1180, screen_height: 820, pixel_ratio: 2, language: 'de-DE', timezone: 'Europe/Berlin', dark_mode: true, connection: 'wifi' };
const PERM = { location: true, camera: null, microphone: false, notifications: null };
r = await call(`sh_track(null, $1, $2, null, $3::jsonb, $4::jsonb, '[]'::jsonb, false, $5, $6)`, [THUB, TS, JSON.stringify(DEV), JSON.stringify(PERM), '10.0.0.5', CODE]);
ok('9  sh_track legt Session an (vsid), speichert nichts falsch', r.ok && r.tracked === true && r.vsid > 0, JSON.stringify(r));
const VSID = r.vsid;
let row = await one(`select ip, browser, os, device, device_type, screen_width sw, dark_mode dm, allow_location al, allow_microphone am, allow_camera ac
                       from sh_vsessions where hub_id = $1 and id = $2`, [THUB, VSID]);
ok('9  sessions: IP/Browser/Gerät/Bildschirm/Hell-Dunkel gespeichert',
   row.ip === '10.0.0.5' && row.browser === 'Safari 18' && row.device === 'iPad' && row.device_type === 'tablet' && row.sw === 1180 && row.dm === true, JSON.stringify(row));
ok('9  Haken: Standort erlaubt, Mikrofon abgelehnt, Kamera nicht gefragt (NULL)', row.al === true && row.am === false && row.ac === null, JSON.stringify(row));
ok('9  participant_id steht NICHT im Schnappschuss, aber in der Tabelle (nur Lehrkraft)',
   (await one(`select count(*)::int n from sh_vsessions where hub_id = $1`, [THUB])).n === 1);
// Zweiter Aufruf: Views dazu (Foto 1 lang, Foto 2 kurz); falsches Foto fällt weg
const VW = [{ photo: '1', ms: 3200, feed: 'foryou', pos: 0, end: 'swipe' }, { photo: '2', ms: '800', feed: 'foryou', pos: 1, end: 'like' }, { photo: '999', ms: 500, feed: 'foryou', pos: 2, end: 'swipe' }, { photo: '1', ms: 100, feed: 'kaputt', pos: 3, end: 'swipe' }];
r = await call(`sh_track(null, $1, $2, $3, null, '{"location":true}'::jsonb, $4::jsonb, false, null, $5)`, [THUB, TS, VSID, JSON.stringify(VW), CODE]);
ok('9  views: gültige Fotos gespeichert, unbekanntes Foto fällt weg', r.ok && r.views === 3, JSON.stringify(r));
row = await one(`select count(*)::int n, count(*) filter (where session_id = $2) s, count(*) filter (where feed is null) nf,
                        max(duration_ms) mx from sh_views where hub_id = $1`, [THUB, VSID]);
ok('9  views hängen an der Session, falsches feed → NULL, Dauer gespeichert', row.n === 3 && row.s === 3 && row.nf === 1 && row.mx === 3200, JSON.stringify(row));
// Schnappschuss zeigt sessions/views mit den richtigen Spalten
r = await call(`sh_db_snapshot(null, $1, $2, $3)`, [CODE, THUB, TS]);
ok('9  Schnappschuss: sessions ohne participant_id',
   r.ok && r.tables.sessions && r.tables.sessions.cols.join() === 'id,user_id,started_at,last_seen_at,ended_at,ip,user_agent,browser,os,device_type,device,screen_width,screen_height,pixel_ratio,language,timezone,dark_mode,connection,allow_location,allow_camera,allow_microphone,allow_notifications'
   && !r.tables.sessions.cols.includes('participant_id'), JSON.stringify(r.tables && r.tables.sessions && r.tables.sessions.cols));
ok('9  Schnappschuss: views mit session_id/duration_ms',
   r.tables.views && r.tables.views.cols.join() === 'id,user_id,photo_id,session_id,viewed_at,duration_ms,feed,position,ended_by' && r.tables.views.rows.length === 3, JSON.stringify(r.tables && r.tables.views && r.tables.views.cols));
// sh_my_data: jeder sieht nur seine eigenen Daten
r = await call(`sh_my_data(null, $1, $2, $3)`, [THUB, TS, CODE]);
ok('9  sh_my_data: eigene Session + Views-Summe + Haken', r.ok && r.sessions.length === 1 && r.views.count === 3 && r.sessions[0].allow.location === true && r.sessions[0].ip === '10.0.0.5', JSON.stringify(r.views));
// SQL (sh_db_apply): 'sessions' → sh_vsessions (Namensabbildung), UPDATE/DELETE
r = await call(`sh_db_apply(null, $1, $2, $3, $4::jsonb)`, [CODE, THUB, TS, JSON.stringify([{ t: 'sessions', op: 'update', key: { id: VSID }, row: { id: VSID, ip: '1.2.3.4' } }])]);
ok('9  UPDATE sessions per SQL trifft sh_vsessions', r.ok && (await one(`select ip from sh_vsessions where hub_id = $1 and id = $2`, [THUB, VSID])).ip === '1.2.3.4', JSON.stringify(r));
r = await call(`sh_db_apply(null, $1, $2, $3, $4::jsonb)`, [CODE, THUB, TS, JSON.stringify([{ t: 'views', op: 'delete', key: { id: 2 } }])]);
ok('9  DELETE views per SQL', r.ok && (await one(`select count(*)::int n from sh_views where hub_id = $1`, [THUB])).n === 2, JSON.stringify(r));
r = await call(`sh_db_apply(null, $1, $2, $3, $4::jsonb)`, [CODE, THUB, TS, JSON.stringify([{ t: 'views', op: 'insert', row: { id: 50, user_id: 1, photo_id: 999, viewed_at: '2026-11-04 10:00:00' } }])]);
ok('9  INSERT views mit fremdem Foto → Fremdschlüssel', r.error === 'db_rejected' && r.state === '23503', JSON.stringify(r));
// sessions entzogen: nicht mehr tracken (die Daten bleiben, wie bei den anderen Tabellen)
await call(`skill_room_set_state($1, null, $2::jsonb)`, [CODE, JSON.stringify({ tables: ['photos'] })]);
r = await call(`sh_track(null, $1, $2, $3, null, null, '[]'::jsonb, false, null, $4)`, [THUB, TS, VSID, CODE]);
ok('9  sessions entzogen → sh_track meldet tracked:false', r.ok && r.tracked === false, JSON.stringify(r));
ok('9  … die Daten bleiben', (await one(`select count(*)::int n from sh_vsessions where hub_id = $1`, [THUB])).n === 1);
await call(`skill_room_set_state($1, null, $2::jsonb)`, [CODE, JSON.stringify({ tables: ['photos', 'sessions', 'views'] })]);
r = await call(`sh_track(null, $1, $2, $3, null, '{"camera":true,"notifications":false}'::jsonb, '[]'::jsonb, true, null, $4)`, [THUB, TS, VSID, CODE]);
row = await one(`select allow_camera ac, allow_notifications an, allow_location al, ended_at is not null e from sh_vsessions where hub_id = $1 and id = $2`, [THUB, VSID]);
ok('9  wieder erstellt: Haken nachgetragen (Kamera ja, Benachrichtigungen nein), Standort bleibt, Ende gesetzt',
   r.tracked === true && row.ac === true && row.an === false && row.al === true && row.e === true, JSON.stringify(row));

/* 8 */
await as(null);
await db.query(`update skill_participants set blocked = true where token = 'tokC'`);
r = await call(`sh_home('tokC')`);
ok('8  stillgelegt → blocked', r.error === 'blocked');
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
const rest = await one(`select (select count(*) from sh_hubs) + (select count(*) from sh_users) + (select count(*) from sh_photos)
                              + (select count(*) from sh_media) + (select count(*) from sh_sessions)
                              + (select count(*) from sh_vsessions) + (select count(*) from sh_views) n`);
ok('8  Raum weg → alles weg', Number(rest.n) === 0);
let twice = true;
try { await db.exec(mig('0265_yoursozialnet.sql')); await db.exec(mig('0266_yoursozialnet_feinschliff.sql')); await db.exec(mig('0267_yoursozialnet_country_cm_likes.sql')); await db.exec(mig('0268_yoursozialnet_foto_metadaten.sql')); await db.exec(mig('0269_yoursozialnet_ohne_ort.sql')); await db.exec(mig('0270_yoursozialnet_analytics.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('8  Migrationen 0265–0270 laufen ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
