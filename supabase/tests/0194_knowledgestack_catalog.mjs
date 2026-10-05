/* Prüfstand für Migration 0194 — Knowledge Stack: der Fragenkatalog.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0194.

   Kernzusagen:
     1. Privat sieht nur der Besitzer; Schule nur die Schule; Hub alle Lehrkräfte.
     2. Besitzer bearbeitet/löscht auch Veröffentlichtes; Fremde nicht.
     3. Veröffentlichen/Zurückstufen jederzeit; ohne Lehrerrolle nur privat.
     4. Admin: Veröffentlichtes löschen/auf privat stellen — Privates nicht;
        Schuladmin nur in seinem Bereich, Superadmin überall.
     5. Themenfeld ist fest (Unbekanntes → Andere).
     6. Peek zeigt nur Fragetexte; Thumbnails nur für Sichtbares.
     7. Die Raum-Auswahl nimmt nur sichtbare Kataloge.
   Aufruf:  node supabase/tests/0194_knowledgestack_catalog.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
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
const files = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();

await db.exec(STUBS);
for (const f of files) {
  try { await db.exec(mig(f)); }
  catch (e) {
    if (BEKANNT.has(f.slice(0, 4))) continue;
    console.error(`FEHLER in ${f}: ${e.message}`); process.exit(1);
  }
}
console.log('— 0001 … 0194 laufen durch —\n');

const U = n => `e0000000-0000-4000-8000-00000000000${n}`;
const [A, B, C, D, ADM, SUP, KID] = [1, 2, 3, 4, 5, 6, 7].map(U);
const S1 = (await one(`insert into schools (slug, name) values ('s1', 'Schule 1') returning id`)).id;
const S2 = (await one(`insert into schools (slug, name) values ('s2', 'Schule 2') returning id`)).id;
await db.query(`insert into auth.users (id) select unnest($1::uuid[])`, [[A, B, C, D, ADM, SUP, KID]]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status, is_admin, is_superadmin) values
  ($1,$8,'a','Frau A','approved',false,false),
  ($2,$8,'b','Herr B','approved',false,false),
  ($3,$9,'c','Frau C','approved',false,false),
  ($4,$8,'d','Herr D','none',false,false),
  ($5,$8,'adm','Admin 1','approved',true,false),
  ($6,$9,'sup','Super','approved',false,true),
  ($7,$8,'kid','Kind','none',false,false)`, [A, B, C, D, ADM, SUP, KID, S1, S2]);
const als = async uid => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
const rpc = async (uid, sql, params) => { await als(uid); return (await one(sql, params)).r; };
const qs = JSON.stringify([
  { question_text: 'Was ist 2+2?', options: ['3', '4', '5', '6'], correct_idx: 1, correct_indices: [1] },
  { question_text: 'Hauptstadt von Frankreich?', options: ['Rom', 'Paris', 'Bonn', 'Oslo'], correct_idx: 1, correct_indices: [1] }]);
const save = (uid, id, title, subj, vis, thumb = null, custom = false) =>
  rpc(uid, `select ks_catalog_save($1, $2, $3, $4::jsonb, $5, $6, $7) r`, [id, title, subj, qs, vis, thumb, custom]);
const list = async uid => (await rpc(uid, `select ks_catalogs_list() r`)).catalogs;
const titles = a => a.filter(c => !c.is_template).map(c => c.title).sort().join('|');
const THUMB = 'data:image/jpeg;base64,/9j/AAAA';

/* ══ 1. Sichtbarkeit ═════════════════════════════════════════════ */
const priv = (await save(A, null, 'A privat', 'Mathematik', null)).catalog_id;
const sch  = (await save(A, null, 'A schule', 'Deutsch', 'school', THUMB, true)).catalog_id;
const hub  = (await save(A, null, 'A hub', 'Spaß & Rätsel', 'hub')).catalog_id;
ok('1  Neu ohne Angabe ist privat', (await list(A)).find(c => c.id === priv).visibility === 'private');
ok('1  A sieht alle drei, mit Autor', titles(await list(A)) === 'A hub|A privat|A schule'
   && (await list(A))[0].author_name === 'Frau A');
ok('1  B (gleiche Schule) sieht Schule + Hub, nicht Privat', titles(await list(B)) === 'A hub|A schule');
ok('1  C (andere Schule) sieht nur Hub', titles(await list(C)) === 'A hub');
ok('1  Kind (keine Lehrkraft) sieht nichts von A', titles(await list(KID)) === '');
ok('1  Admin derselben Schule sieht Schule + Hub', titles(await list(ADM)) === 'A hub|A schule');
ok('1  Superadmin sieht alles Veröffentlichte, nicht Privates', titles(await list(SUP)) === 'A hub|A schule');
ok('1  Liste hat has_thumb, count, search, categories',
   (await list(B)).find(c => c.id === sch).has_thumb === true
   && (await list(B)).find(c => c.id === sch).count === 2
   && /Frankreich/.test((await list(B)).find(c => c.id === sch).search)
   && (await rpc(B, `select ks_catalogs_list() r`)).categories.length >= 20);
ok('1  Fremdes Privates: get → not_found', (await rpc(B, `select ks_catalog_get($1) r`, [priv])).ok === false);

/* ══ 2. Besitzer / Fremde ════════════════════════════════════════ */
ok('2  Besitzer bearbeitet Veröffentlichtes', (await save(A, hub, 'A hub 2', 'Mathematik', null)).ok === true);
ok('2  Status bleibt beim Bearbeiten', (await list(A)).find(c => c.id === hub).visibility === 'hub');
ok('2  Fremder kann nicht speichern', (await save(B, hub, 'Hack', 'Mathematik', null)).error === 'not_found');
ok('2  Fremder kann nicht löschen', (await rpc(B, `select ks_catalog_delete($1) r`, [hub])).ok === false);
ok('2  Fremder kann nicht umstellen',
   (await rpc(B, `select ks_catalog_set_visibility($1, 'private') r`, [hub])).ok === false);
ok('2  Besitzer löscht Veröffentlichtes', (await rpc(A, `select ks_catalog_delete($1) r`, [(await save(A, null, 'weg', 'Sport', 'hub')).catalog_id])).ok === true);

/* ══ 3. Veröffentlichen / Zurückstufen ═══════════════════════════ */
ok('3  privat → hub', (await rpc(A, `select ks_catalog_set_visibility($1, 'hub') r`, [priv])).ok === true
   && titles(await list(C)) === 'A hub 2|A privat');
ok('3  hub → school', (await rpc(A, `select ks_catalog_set_visibility($1, 'school') r`, [priv])).ok === true
   && titles(await list(C)) === 'A hub 2');
ok('3  zurück auf privat', (await rpc(A, `select ks_catalog_set_visibility($1, 'private') r`, [priv])).ok === true
   && titles(await list(B)) === 'A hub 2|A schule');
ok('3  Unsinn wird abgewiesen', (await rpc(A, `select ks_catalog_set_visibility($1, 'alle') r`, [priv])).error === 'bad_visibility');
ok('3  Ohne Lehrerrolle: nur privat',
   (await save(D, null, 'D hub', 'Mathematik', 'hub')).error === 'not_allowed'
   && (await save(D, null, 'D privat', 'Mathematik', 'private')).ok === true);

/* ══ 4. Admin ════════════════════════════════════════════════════ */
const cadm = list(ADM); await cadm;
ok('4  Liste: can_admin für Admin bei Veröffentlichtem',
   (await list(ADM)).every(c => c.can_admin === true) && (await list(B)).every(c => c.can_admin === false));
ok('4  Admin stellt Hub-Quiz auf privat',
   (await rpc(ADM, `select ks_catalog_set_visibility($1, 'private') r`, [hub])).ok === true
   && !(await list(C)).some(c => c.id === hub)
   && (await list(A)).find(c => c.id === hub).visibility === 'private');
ok('4  Admin kann nichts veröffentlichen', (await rpc(ADM, `select ks_catalog_set_visibility($1, 'hub') r`, [hub])).ok === false);
ok('4  Admin löscht Schul-Quiz', (await rpc(ADM, `select ks_catalog_delete($1) r`, [sch])).ok === true
   && !(await list(A)).some(c => c.id === sch));
ok('4  Admin fasst Privates nicht an', (await rpc(ADM, `select ks_catalog_delete($1) r`, [hub])).ok === false
   && (await list(A)).some(c => c.id === hub));
const csch = (await save(C, null, 'C schule', 'Musik', 'school')).catalog_id;
ok('4  Schuladmin kann andere Schule nicht löschen', (await rpc(ADM, `select ks_catalog_delete($1) r`, [csch])).ok === false);
ok('4  Superadmin löscht überall', (await rpc(SUP, `select ks_catalog_delete($1) r`, [csch])).ok === true);

/* ══ 5. Themenfeld ═══════════════════════════════════════════════ */
const frei = (await save(A, null, 'Frei', 'Mathe-Freestyle', null)).catalog_id;
ok('5  Unbekanntes Themenfeld → Andere', (await list(A)).find(c => c.id === frei).subject === 'Andere');
ok('5  Bekanntes bleibt', (await list(A)).find(c => c.id === priv).subject === 'Mathematik');

/* ══ 6. Peek, Thumbnails ═════════════════════════════════════════ */
const sch2 = (await save(A, null, 'A schule 2', 'Deutsch', 'school', THUMB, true)).catalog_id;
const pk = await rpc(B, `select ks_catalog_peek($1) r`, [sch2]);
ok('6  Peek: nur die Fragetexte', pk.ok && pk.questions.length === 2 && pk.questions[0] === 'Was ist 2+2?'
   && !JSON.stringify(pk).includes('correct'));
ok('6  Peek: Fremdes Privates → nicht gefunden', (await rpc(B, `select ks_catalog_peek($1) r`, [priv])).ok === false);
const th = await rpc(B, `select ks_catalog_thumbs(array[$1::uuid, $2::uuid]) r`, [sch2, priv]);
ok('6  Thumbs: nur Sichtbares mit Bild', Object.keys(th.thumbs).join() === sch2);
ok('6  Zu großes Thumbnail wird abgewiesen',
   (await save(A, null, 'X', 'Sport', null, 'data:image/jpeg;base64,' + 'A'.repeat(310000))).error === 'thumb_too_big');
ok('6  get liefert thumb_custom', (await rpc(A, `select ks_catalog_get($1) r`, [sch2])).thumb_custom === true);
ok('6  Ohne Bild kein thumb_custom',
   (await rpc(A, `select ks_catalog_get($1) r`, [(await save(A, null, 'oB', 'Sport', null, null, true)).catalog_id])).thumb_custom === false);

/* ══ 7. Raum ═════════════════════════════════════════════════════ */
const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('KATLG2', 'knowledgestack', $1, $2, 'K') returning id`, [B, S1])).id;
await als(B);
ok('7  Raum: eigener-Schule-Katalog wählbar', (await one(`select ks_room_setup('KATLG2', $1) r`, [sch2])).r.ok === true);
ok('7  Raum: fremdes Privates nicht wählbar', (await one(`select ks_room_setup('KATLG2', $1) r`, [priv])).r.error === 'not_found');
const g = (await one(`select ks_room_get('KATLG2') r`)).r;
ok('7  Lobby-Liste kommt aus dem Katalog (Autor, Themenfeld)',
   g.ok === true && Array.isArray(g.catalogs) && g.catalogs.some(c => c.author_name === 'Frau A')
   && Array.isArray(g.categories) && g.categories.length > 10, g.error || '');

/* ══ 8. Zweimal einspielbar ══════════════════════════════════════ */
try { await db.exec(mig('0194_knowledgestack_catalog.sql')); ok('8  Migration läuft ein zweites Mal', true); }
catch (e) { ok('8  Migration läuft ein zweites Mal', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nAlles grün.');
process.exit(fails ? 1 : 0);
