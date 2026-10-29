/* Prüfstand für Migration 0238 — Knowledge Stack: das Erklär-Quiz.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0238.

   Die Kernzusagen:
     1. Jede freigeschaltete Lehrkraft sieht das Quiz im Katalog — egal
        an welcher Schule —, Kinder und nicht Freigeschaltete nicht.
     2. ks_catalog_get liefert alle Fragen mit Foto; die Fragetypen
        Auswahl, Wahr/Falsch, Skala und Münzen kommen vor.
     3. Niemand kann es ändern oder löschen; „Kopie“ (Speichern ohne id)
        legt ein eigenes, privates Quiz mit denselben Fragen an.
     4. Es lässt sich im Raum spielen (ks_room_setup).
     5. Die Migration läuft zweimal (Fragen werden ersetzt, nicht verdoppelt).

   Aufruf:  node supabase/tests/0238_knowledgestack_anleitung.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;  -- 0223: Admins nur mit 2FA
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
for (const f of readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(mig(f)); }
  catch (e) {
    if (BEKANNT.has(f.slice(0, 4))) continue;
    console.error(`FEHLER in ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log('— 0001 … 0238 laufen durch —\n');

const ID = '00000000-0000-4000-8000-000000000238';
const U = n => `e0000000-0000-4000-8000-00000000000${n}`;
const [A, C, D, KID] = [1, 2, 3, 4].map(U);
const S1 = (await one(`insert into schools (slug, name) values ('s1', 'Schule 1') returning id`)).id;
const S2 = (await one(`insert into schools (slug, name) values ('s2', 'Schule 2') returning id`)).id;
await db.query(`insert into auth.users (id) select unnest($1::uuid[])`, [[A, C, D, KID]]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status) values
  ($1,$5,'a','Frau A','approved'), ($2,$6,'c','Frau C','approved'),
  ($3,$5,'d','Herr D','none'),     ($4,$5,'kid','Kind','none')`, [A, C, D, KID, S1, S2]);
const als = async uid => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
const rpc = async (uid, sql, params) => { await als(uid); return (await one(sql, params)).r; };
const liste = async uid => (await rpc(uid, `select ks_catalogs_list() r`)).catalogs || [];

/* ══ 1. Wer sieht es ════════════════════════════════════════════ */
for (const [wer, uid] of [['Lehrkraft Schule 1', A], ['Lehrkraft Schule 2', C]]) {
  const k = (await liste(uid)).find(c => c.id === ID);
  ok(`${wer} sieht das Erklär-Quiz im Katalog`, !!k);
  ok(`${wer}: 🌍 Hub, von MPSkills, 20 Fragen, mit Vorschaubild`,
     k && k.visibility === 'hub' && k.author_name === 'MPSkills' && k.count === 20 && k.has_thumb,
     JSON.stringify(k && { v: k.visibility, a: k.author_name, n: k.count, t: k.has_thumb }));
  ok(`${wer}: nicht als eigenes markiert`, k && !k.mine);
}
ok('nicht freigeschaltete Lehrkraft sieht es nicht', !(await liste(D)).some(c => c.id === ID));
ok('Kind sieht es nicht', !(await liste(KID)).some(c => c.id === ID));
ok('ohne Anmeldung: nichts', !(await liste(null)).some(c => c.id === ID));

/* ══ 2. Inhalt ══════════════════════════════════════════════════ */
const g = await rpc(C, `select ks_catalog_get($1) r`, [ID]);
ok('ks_catalog_get liefert das Quiz', g && g.ok && g.is_template, g && g.error);
const fr = (g && g.questions) || [];
ok('20 Fragen', fr.length === 20, String(fr.length));
ok('jede Frage hat ein Foto (data:image/jpeg)', fr.every(q => /^data:image\/jpeg;base64,/.test(q.image || '')));
ok('jede Frage hat eine Erklärung', fr.every(q => (q.explanation || '').length > 10));
const arten = new Set(fr.map(q => q.kind));
ok('alle vier Fragetypen kommen vor', ['mc', 'tf', 'scale', 'bet'].every(k => arten.has(k)), [...arten].join(','));
const sk = fr.find(q => q.kind === 'scale');
ok('Skala: Ziel liegt in der Spanne', sk && sk.scale && +sk.scale.min <= +sk.scale.target && +sk.scale.target <= +sk.scale.max);
const bet = fr.find(q => q.kind === 'bet');
ok('Münzen: mehrere richtige Antworten', bet && (bet.correct_indices || []).length > 1);
ok('Wahr/Falsch: genau zwei Antworten', fr.filter(q => q.kind === 'tf').every(q => q.options.length === 2));
ok('Auswahl: richtige Antwort gibt es', fr.filter(q => q.kind === 'mc').every(q => q.correct_idx < q.options.length));
ok('Reihenfolge 0…19', fr.every((q, i) => q.sort_order === i));

/* ══ 3. Nicht änderbar, aber kopierbar ══════════════════════════ */
const qsJson = JSON.stringify(fr.map(q => ({ kind: q.kind, scale: q.scale, question_text: q.question_text,
  options: q.options, correct_idx: q.correct_idx, correct_indices: q.correct_indices,
  time_limit_sec: q.time_limit_sec, explanation: q.explanation, image: q.image, image_name: q.image_name })));
const aend = await rpc(A, `select ks_catalog_save($1, 'Gekapert', 'Andere', $2::jsonb, 'private', null, false) r`, [ID, qsJson]);
ok('Lehrkraft kann die Vorlage nicht überschreiben', !aend.ok, JSON.stringify(aend).slice(0, 80));
const del = await rpc(A, `select ks_catalog_delete($1) r`, [ID]);
ok('Lehrkraft kann die Vorlage nicht löschen', !del.ok);
ok('Titel unverändert', (await one(`select title from ks_catalogs where id = $1`, [ID])).title
   === 'Knowledge Stack: Was das Quiz alles kann');
const kopie = await rpc(A, `select ks_catalog_save(null, 'Meine Kopie', 'Tablet & Medien', $1::jsonb, 'private', null, false) r`, [qsJson]);
ok('„⧉ Kopie“ speichert ein eigenes Quiz mit allen 20 Fragen samt Fotos', kopie.ok && kopie.count === 20,
   JSON.stringify(kopie).slice(0, 120));
if (kopie.ok) {
  const k2 = await rpc(A, `select ks_catalog_get($1) r`, [kopie.catalog_id]);
  ok('Kopie behält die Fragetypen', k2.questions.map(q => q.kind).join() === fr.map(q => q.kind).join());
  ok('Kopie ist privat und gehört Frau A', k2.mine && k2.visibility === 'private');
}

/* ══ 4. Im Raum spielen ═════════════════════════════════════════ */
await als(A);
const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('ANLTNG', 'knowledgestack', $1, $2, 'Klasse 7b') returning id`, [A, S1])).id;
const setup = await rpc(A, `select ks_room_setup('ANLTNG', $1) r`, [ID]);
ok('im Raum als Quiz wählbar (ks_room_setup)', setup && setup.ok, JSON.stringify(setup).slice(0, 100));
const brett = await one(`select catalog_id, question_count from ks_boards where room_id = $1`, [R]);
ok('das Brett hat das Erklär-Quiz mit 20 Fragen', brett && brett.catalog_id === ID && brett.question_count === 20,
   JSON.stringify(brett));

/* ══ 5. Zweimal einspielen ══════════════════════════════════════ */
await db.exec(mig('0238_knowledgestack_anleitung.sql'));
ok('zweimal eingespielt: weiter 20 Fragen',
   (await one(`select count(*)::int n from ks_questions where catalog_id = $1`, [ID])).n === 20);
ok('zweimal eingespielt: ein Katalog',
   (await one(`select count(*)::int n from ks_catalogs where id = $1`, [ID])).n === 1);

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
