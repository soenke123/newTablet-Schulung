/* Prüfstand für Migration 0202 — Projektarbeit: Stunden gemeinsam,
   Export/Import/Backup, ein Jahr Laufzeit.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0202.

   Die Kernzusagen:
     1. Ein Stundeneintrag nennt, wer dabei war (who) — nur Leute aus der
        eigenen Gruppe, jede Person einmal, mit Namen (whoNames). Wer
        einträgt, muss nicht selbst dabei sein. Ohne who (altes Gerät):
        nur der Schreiber.
     2. Ändern/löschen darf der Urheber und wer im Eintrag steht; der
        Urheber bleibt.
     3. Export: ein Projekt oder die ganze Klasse, ohne Codes.
     4. Import in einen Planungsraum ersetzt dessen Inhalt; ohne Ziel
        ersetzt jedes Projekt seine Gruppe oder wird eine neue Gruppe.
        Vorher entsteht ein Backup „vorher"; Versionen steigen.
     5. Wöchentliches Auto-Backup nur bei Aktivität; einspielen holt
        eine aufgelöste Gruppe zurück. Nur der Besitzer.
     6. Projektarbeit-Räume halten ein Jahr — auch nach skill_touch.
     7. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0202_projektarbeit_stunden_backup.mjs */
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

const T     = 'e0000000-0000-4000-8000-000000000001';
const OTHER = 'e0000000-0000-4000-8000-000000000002';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T, OTHER]);
await db.query(`insert into profiles (id, school_id, account_name, display_name)
                values ($1, $3, 'lehrer', 'Lehrer'), ($2, $3, 'andere', 'Andere')`, [T, OTHER, SCHOOL]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
await als(T);

const tool = await one(`select * from skill_tools where id = 'projekt'`);
ok('0  skill_tools: projekt mit Ordner Projektarbeit', tool && tool.folder === 'Projektarbeit');

const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('PRJEKT', 'projekt', $1, $2, 'Klasse 8b') returning id`, [T, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 6) g`);
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const view = (tok) => call(`pa_view($1, null)`, [tok]);
const save = (tok, ops) => call(`pa_save($1, $2)`, [tok, JSON.stringify(ops)]);
const tsave = (g, ops) => call(`pa_room_save('PRJEKT', $1, $2)`, [g, JSON.stringify(ops)]);
const tget = (g) => call(`pa_room_get('PRJEKT', $1)`, [g || null]);
const pid  = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;
const P = {};
for (let i = 1; i <= 6; i++) P[i] = await pid('t' + i);
const TODAY = (await one(`select ((now() at time zone 'Europe/Berlin')::date)::text d`)).d;
const YESTERDAY = (await one(`select ((now() at time zone 'Europe/Berlin')::date - 1)::text d`)).d;

// Gruppe 1: Kind 1, 2, 3 — Planungsraum offen. Kind 4 + 5: Gruppe 2.
const G1 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[2], P[1]])).group;
await call(`pa_room_assign('PRJEKT', $1, $2)`, [P[3], G1]);
await call(`pa_room_plan('PRJEKT', $1)`, [G1]);
const G2 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[5], P[4]])).group;
await call(`pa_room_plan('PRJEKT', $1)`, [G2]);

/* ══ 1. Wer war dabei ═══════════════════════════════════════════ */
const log = (extra) => Object.assign({ date: TODAY, hours: 1, text: 'Plakat gestaltet', next: '' }, extra);
let r = await save('t1', [{ op: 'put', kind: 'log', id: 'l1', v: 0, data: log({ who: [P[2], P[4], P[3], P[2]] }) }]);
let l1 = r.items && r.items[0];
ok('1  Kind 1 trägt für Kind 2 + 3 ein: Fremde und Doppelte fallen raus, Reihenfolge bleibt',
   r.ok && JSON.stringify(l1.data.who) === JSON.stringify([P[2], P[3]]), JSON.stringify(r).slice(0, 300));
ok('1  Namen stehen dabei, Urheber ist Kind 1',
   JSON.stringify(l1.data.whoNames) === JSON.stringify(['Kind 2', 'Kind 3']) && l1.data.by === P[1] && l1.data.byName === 'Kind 1');
r = await save('t1', [{ op: 'put', kind: 'log', id: 'l2', v: 0, data: log({ who: [P[4]] }) }]);
ok('1  nur Leute aus einer anderen Gruppe: who_missing', r.error === 'who_missing');
r = await save('t1', [{ op: 'put', kind: 'log', id: 'l2', v: 0, data: log({ who: [] }) }]);
ok('1  niemand ausgewählt: who_missing', r.error === 'who_missing');
r = await save('t1', [{ op: 'put', kind: 'log', id: 'l2', v: 0, data: log({}) }]);
ok('1  ohne who (altes Gerät): nur der Schreiber', r.ok && JSON.stringify(r.items[0].data.who) === JSON.stringify([P[1]])
   && JSON.stringify(r.items[0].data.whoNames) === JSON.stringify(['Kind 1']));

/* ══ 2. Wer ändern darf ═════════════════════════════════════════ */
r = await save('t2', [{ op: 'put', kind: 'log', id: 'l1', v: 1, data: Object.assign({}, l1.data, { text: 'Plakat fertig' }) }]);
ok('2  Kind 2 steht im Eintrag und darf ändern; Urheber bleibt Kind 1',
   r.ok && r.items[0].data.text === 'Plakat fertig' && r.items[0].data.by === P[1] && r.items[0].data.at === l1.data.at);
r = await save('t2', [{ op: 'put', kind: 'log', id: 'l2', v: 1, data: log({ who: [P[1], P[2]] }) }]);
ok('2  Kind 2 steht nicht in l2: not_yours', r.error === 'not_yours');
r = await save('t1', [{ op: 'put', kind: 'log', id: 'l1', v: 2, data: Object.assign({}, l1.data, { who: [P[3]] }) }]);
ok('2  Urheber (nicht im Eintrag) darf ändern', r.ok && JSON.stringify(r.items[0].data.who) === JSON.stringify([P[3]]));
r = await save('t3', [{ op: 'del', kind: 'log', id: 'l1', v: 3 }]);
ok('2  wer im Eintrag steht, darf löschen', r.ok);

/* ══ 3. Export ══════════════════════════════════════════════════ */
await save('t1', [{ op: 'put', kind: 'goal', id: 'main', v: 0, data: { title: 'Wetterstation', text: '<p>x</p>', images: [] } },
                  { op: 'put', kind: 'task', id: 't1', v: 0, data: { title: 'Sensor', col: 'todo', who: [] } }]);
await save('t4', [{ op: 'put', kind: 'task', id: 'a1', v: 0, data: { title: 'Beete', col: 'doing', who: [] } }]);
let ex = await call(`pa_room_export('PRJEKT', $1)`, [G1]);
ok('3  Export eines Projekts', ex.ok && ex.data.format === 'projektarbeit' && ex.data.projects.length === 1
   && ex.data.projects[0].group === G1 && ex.data.projects[0].items.length === 3
   && JSON.stringify(ex.data.projects[0].members) === JSON.stringify(['Kind 1', 'Kind 2', 'Kind 3']));
ok('3  keine persönlichen Codes in der Datei', !/recover|"key"/.test(JSON.stringify(ex.data)));
const exAll = await call(`pa_room_export('PRJEKT', null)`);
ok('3  Export der ganzen Klasse: beide Planungsräume', exAll.ok && exAll.data.projects.length === 2);
await als(OTHER);
ok('3  fremde Lehrkraft: not_found', (await call(`pa_room_export('PRJEKT', null)`)).error === 'not_found');
await als(T);

/* ══ 4. Import ══════════════════════════════════════════════════ */
const vOf = async (g, k, id) => (await one(`select version from pa_items where group_id = $1 and kind = $2 and item_id = $3`, [g, k, id]))?.version;
const before = await vOf(G2, 'task', 'a1');
const proj = ex.data.projects[0];
r = await call(`pa_room_import('PRJEKT', $1, $2)`, [JSON.stringify([proj]), G2]);
let items2 = (await one(`select jsonb_agg(kind || ':' || item_id order by kind, item_id) v from pa_items where group_id = $1`, [G2])).v;
ok('4  Import in Gruppe 2 ersetzt deren Inhalt', r.ok && JSON.stringify(items2) === JSON.stringify(['goal:main', 'log:l2', 'task:t1']),
   JSON.stringify(r) + ' ' + JSON.stringify(items2));
ok('4  Versionen liegen über allem, was es in der Gruppe gab', (await vOf(G2, 'task', 't1')) > before);
let bk = await call(`pa_room_backups('PRJEKT')`);
ok('4  vorher entstand ein Backup „vorher"', bk.ok && bk.backups.some(b => b.kind === 'vorher' && b.projects === 2));
r = await call(`pa_room_import('PRJEKT', $1, $2)`, [JSON.stringify([proj, proj]), G2]);
ok('4  zwei Projekte in einen Planungsraum: invalid_input', r.error === 'invalid_input');
r = await call(`pa_room_import('PRJEKT', $1, null)`, [JSON.stringify([{ name: 'Neu aus Datei', items: proj.items }])]);
const ng = r.groups && r.groups[0];
const ngr = ng && await one(`select * from pa_groups where id = $1`, [ng]);
ok('4  ohne Ziel und ohne bekannte Gruppe: neue Gruppe mit offenem Planungsraum',
   r.ok && r.created === 1 && ngr && ngr.plan_open && ngr.name === 'Neu aus Datei' && ngr.no > 0);
ok('4  … die neue Gruppe ohne Mitglieder bleibt stehen',
   (await tget()).groups.some(g => g.id === ng));
r = await call(`pa_room_import('PRJEKT', $1, null)`, [JSON.stringify([{ items: [{ kind: 'goal', id: 'x', data: {} }] }])]);
ok('4  kaputtes Projekt: invalid_input, nichts geändert', r.error === 'invalid_input');
await als(null);
ok('4  ohne Anmeldung: not_authenticated', (await call(`pa_room_import('PRJEKT', $1, null)`, [JSON.stringify([proj])])).error === 'not_authenticated');
await als(T);

/* ══ 5. Auto-Backup, einspielen ═════════════════════════════════ */
await db.query(`delete from pa_backups`);
await save('t1', [{ op: 'put', kind: 'task', id: 't9', v: 0, data: { title: 'neu', col: 'todo', who: [] } }]);
bk = await call(`pa_room_backups('PRJEKT')`);
ok('5  Änderung im Raum ohne Backup → Auto-Backup', bk.backups.filter(b => b.kind === 'auto').length === 1);
await save('t1', [{ op: 'put', kind: 'task', id: 't8', v: 0, data: { title: 'neu', col: 'todo', who: [] } }]);
bk = await call(`pa_room_backups('PRJEKT')`);
ok('5  in derselben Woche kein zweites', bk.backups.filter(b => b.kind === 'auto').length === 1);
await db.query(`update pa_backups set created_at = now() - interval '8 days'`);
await save('t1', [{ op: 'put', kind: 'task', id: 't7', v: 0, data: { title: 'neu', col: 'todo', who: [] } }]);
bk = await call(`pa_room_backups('PRJEKT')`);
ok('5  nach über 7 Tagen: ein neues', bk.backups.filter(b => b.kind === 'auto').length === 2);
const latest = bk.backups[0];
const got = await call(`pa_room_backup_get('PRJEKT', $1)`, [latest.id]);
ok('5  Backup herunterladen', got.ok && got.data.projects.some(p => p.group === G1));

// Gruppe 1 auflösen — ihr Planungsraum ist weg — und aus dem Backup zurückholen.
await call(`pa_room_group_delete('PRJEKT', $1)`, [G1]);
r = await call(`pa_room_backup_restore('PRJEKT', $1, $2)`, [latest.id, G1]);
const back = r.groups && r.groups[0];
const cnt = back && (await one(`select count(*)::int n from pa_items where group_id = $1`, [back])).n;
ok('5  aufgelöste Gruppe kommt als neue Gruppe mit ihrem Inhalt zurück', r.ok && r.created === 1 && cnt >= 5,
   JSON.stringify(r) + ' ' + cnt);
r = await call(`pa_room_backup_restore('PRJEKT', $1, $2)`, [latest.id, '00000000-0000-4000-8000-000000000000']);
ok('5  Projekt, das nicht im Backup steht: not_in_backup', r.error === 'not_in_backup');
await als(OTHER);
ok('5  fremde Lehrkraft sieht keine Backups', (await call(`pa_room_backups('PRJEKT')`)).error === 'not_found');
await als(T);

/* ══ 6. Ein Jahr ════════════════════════════════════════════════ */
const days = async (id) => (await one(`select extract(day from expires_at - now())::int d from skill_rooms where id = $1`, [id])).d;
ok('6  Projektarbeit-Raum läuft ein Jahr', (await days(R)) >= 364, String(await days(R)));
await db.query(`update skill_rooms set last_active_at = now() - interval '1 hour' where id = $1`, [R]);
await db.query(`select skill_touch($1)`, [R]);
ok('6  skill_touch verkürzt das Jahr nicht', (await days(R)) >= 364, String(await days(R)));
const R2 = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                       values ('ANDERS', 'scrum', $1, $2, 'Scrum') returning id`, [T, SCHOOL])).id;
ok('6  andere Skills bleiben bei 30 Tagen', (await days(R2)) <= 30, String(await days(R2)));

/* ══ 7. Wiederholung ════════════════════════════════════════════ */
try { await db.exec(mig('0202_projektarbeit_stunden_backup.sql')); ok('7  Migration läuft zweimal', true); }
catch (e) { ok('7  Migration läuft zweimal', false, e.message); }
ok('7  Backups überleben die Wiederholung', (await call(`pa_room_backups('PRJEKT')`)).backups.length >= 2);

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
